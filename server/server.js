exports = {
  forwardWithAttachments: function(args) {
    const data = args.data;
    const iparams = args.iparams;
    const domain = iparams.freshdesk_domain;
    const token = b64encode(iparams.freshdesk_api_key + ":X");
    const ticketId = data.ticket_id;
    const baseUrl = "https://" + domain;
    const authHeaders = {
      "Authorization": "Basic " + token,
      "Content-Type": "application/json"
    };

    // Step 1: Fetch ticket + conversations
    return Promise.all([
      $request.get(baseUrl + "/api/v2/tickets/" + ticketId, { headers: authHeaders }),
      $request.get(baseUrl + "/api/v2/tickets/" + ticketId + "/conversations", { headers: authHeaders })
    ])
    .then(function(results) {
      const ticket = JSON.parse(results[0].response);
      const convs = JSON.parse(results[1].response);
      const emailBody = buildBody(ticketId, data.ticket_subject, ticket, convs, data.agent_message);

      // Step 2: Build multipart body manually
      const boundary = "----FDKBoundary" + Date.now();
      const parts = [];

      parts.push(textPart(boundary, "body", emailBody));

      const emails = data.to_emails || [];
      for (let i = 0; i < emails.length; i++) {
        parts.push(textPart(boundary, "to_emails[]", emails[i]));
      }

      parts.push(textPart(boundary, "include_quoted_text", "false"));
      parts.push(textPart(boundary, "include_original_attachments", "true"));

      const attachments = data.attachments || [];
      for (let i = 0; i < attachments.length; i++) {
        parts.push(filePart(boundary, attachments[i]));
      }

      parts.push("--" + boundary + "--\r\n");

      const forwardUrl = baseUrl + "/api/v2/tickets/" + ticketId + "/forward";
      return $request.post(forwardUrl, {
        headers: {
          "Authorization": "Basic " + token,
          "Content-Type": "multipart/form-data; boundary=" + boundary
        },
        body: parts.join("")
      });
    })
    .then(function() {
      renderData(null, { success: true });
    })
    .catch(function(err) {
      renderData({ message: err.message || JSON.stringify(err) });
    });
  }
};

function textPart(boundary, name, value) {
  return "--" + boundary + "\r\n" +
    "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" +
    value + "\r\n";
}

function filePart(boundary, file) {
  const ct = file.type || "application/octet-stream";
  return "--" + boundary + "\r\n" +
    "Content-Disposition: form-data; name=\"attachments[]\"; filename=\"" + file.name + "\"\r\n" +
    "Content-Type: " + ct + "\r\n" +
    "Content-Transfer-Encoding: base64\r\n\r\n" +
    file.base64 + "\r\n";
}

function b64encode(str) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < str.length; i += 3) {
    const a = str.charCodeAt(i);
    const b = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
    const c = i + 2 < str.length ? str.charCodeAt(i + 2) : 0;
    out += chars[a >> 2];
    out += chars[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < str.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < str.length ? chars[c & 63] : "=";
  }
  return out;
}

function esc(t) {
  if (!t) { return ""; }
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildBody(ticketId, subject, ticket, convs, agentMsg) {
  let h = "";
  if (agentMsg) {
    h += "<div style='margin-bottom:20px;padding:12px 15px;";
    h += "border-left:4px solid #1a73e8;background:#e8eaf6;'>";
    h += "<div style='white-space:pre-wrap;font-size:14px;'>";
    h += esc(agentMsg) + "</div></div>";
    h += "<hr style='border:none;border-top:1px solid #ddd;margin:20px 0;'>";
  }
  h += "<h3>Ticket #" + ticketId + " — " + esc(subject) + "</h3><hr>";

  const d1 = new Date(ticket.created_at).toLocaleString("es-ES");
  const rq = ticket.requester || {};
  const f1 = rq.email || rq.name || "Cliente";
  h += "<div style='margin-bottom:15px;padding:10px;";
  h += "border-left:3px solid #f57c00;background:#fff8e1;'>";
  h += "<p style='margin:0 0 5px 0;color:#666;font-size:12px;'>";
  h += "<strong>" + esc(f1) + "</strong> — " + d1 + " (Original)</p>";
  h += "<div>" + (ticket.description || "") + "</div></div>";

  if (convs.length > 0) {
    convs.sort(function(a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });
    for (let i = 0; i < convs.length; i++) {
      if (convs[i].private) { continue; }
      const d = new Date(convs[i].created_at).toLocaleString("es-ES");
      const f = convs[i].from_email || "Agente";
      h += "<div style='margin-bottom:15px;padding:10px;";
      h += "border-left:3px solid #2196F3;background:#e3f2fd;'>";
      h += "<p style='margin:0 0 5px 0;color:#666;font-size:12px;'>";
      h += "<strong>" + esc(f) + "</strong> — " + d + "</p>";
      h += "<div>" + (convs[i].body || "") + "</div></div>";
    }
  }
  return h;
}
