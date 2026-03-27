exports = {
  forwardWithAttachments: function(args) {
    const data = args.data;
    const iparams = args.iparams;
    const domain = iparams.freshdesk_domain;
    const token = Buffer.from(iparams.freshdesk_api_key + ":X").toString("base64");
    const ticketId = data.ticket_id;
    const baseUrl = "https://" + domain;
    const headers = {
      "Authorization": "Basic " + token,
      "Content-Type": "application/json"
    };

    // Step 1: Fetch ticket + conversations in parallel
    return Promise.all([
      $request.get(baseUrl + "/api/v2/tickets/" + ticketId, { headers: headers }),
      $request.get(baseUrl + "/api/v2/tickets/" + ticketId + "/conversations", { headers: headers })
    ])
    .then(function(results) {
      const ticket = JSON.parse(results[0].response);
      const convs = JSON.parse(results[1].response);
      const emailBody = buildBody(ticketId, data.ticket_subject, ticket, convs, data.agent_message);

      // Step 2: Forward with multipart
      const forwardUrl = baseUrl + "/api/v2/tickets/" + ticketId + "/forward";
      const formData = {
        body: emailBody,
        include_quoted_text: "false",
        include_original_attachments: "true"
      };

      const emails = data.to_emails || [];
      formData["to_emails[]"] = emails.length === 1 ? emails[0] : emails;

      const attachments = data.attachments || [];
      if (attachments.length === 1) {
        formData["attachments[]"] = {
          value: Buffer.from(attachments[0].base64, "base64"),
          options: { filename: attachments[0].name, contentType: attachments[0].type || "application/octet-stream" }
        };
      } else if (attachments.length > 1) {
        const files = [];
        for (let i = 0; i < attachments.length; i++) {
          files.push({
            value: Buffer.from(attachments[i].base64, "base64"),
            options: { filename: attachments[i].name, contentType: attachments[i].type || "application/octet-stream" }
          });
        }
        formData["attachments[]"] = files;
      }

      return $request.post(forwardUrl, {
        headers: { "Authorization": "Basic " + token },
        formData: formData
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
