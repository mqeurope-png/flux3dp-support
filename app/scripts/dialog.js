let fdClient;
let ticketId;
let ticketSubject;
let authToken;

app.initialized()
  .then(function(client) {
    fdClient = client;
    return Promise.all([
      client.data.get("ticket"),
      client.iparams.get()
    ]);
  })
  .then(function(results) {
    const ticketData = results[0];
    const iparams = results[1];

    ticketId = ticketData.ticket.id;
    ticketSubject = ticketData.ticket.subject;
    authToken = btoa(iparams.freshdesk_api_key + ":X");

    const list = document.getElementById("contacts-list");
    for (let i = 1; i <= 5; i++) {
      const name = iparams["contact_" + i + "_name"];
      const email = iparams["contact_" + i + "_email"];
      if (name && email) {
        const label = document.createElement("label");
        label.className = "contact-option";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.name = "recipient";
        cb.value = email;
        cb.dataset.contactName = name;
        if (iparams["contact_" + i + "_default"]) {
          cb.checked = true;
        }
        const span = document.createElement("span");
        span.textContent = name + " (" + email + ")";
        label.appendChild(cb);
        label.appendChild(span);
        list.appendChild(label);
      }
    }

    buildTemplates(iparams);
    document.getElementById("forwardBtn").disabled = false;
    document.getElementById("draftBtn").disabled = false;
    document.getElementById("forwardBtn").addEventListener("click", function() {
      handleAction("send");
    });
    document.getElementById("draftBtn").addEventListener("click", function() {
      handleAction("draft");
    });
    document.getElementById("cancelBtn").addEventListener("click", function() {
      fdClient.instance.close();
    });
  })
  .catch(function(err) {
    showStatus("Error al iniciar: " + (err.message || JSON.stringify(err)), "error");
  });

function buildTemplates(iparams) {
  const list = document.getElementById("templates-list");
  let count = 0;
  for (let i = 1; i <= 4; i++) {
    const title = iparams["msg_" + i + "_title"];
    const body = iparams["msg_" + i + "_body"];
    if (title && body) {
      const label = document.createElement("label");
      label.className = "template-option";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.name = "template";
      cb.dataset.body = body;
      cb.addEventListener("change", rebuildMessage);
      const span = document.createElement("span");
      span.textContent = title;
      label.appendChild(cb);
      label.appendChild(span);
      list.appendChild(label);
      count++;
    }
  }
  if (count > 0) {
    document.getElementById("templates-section").classList.remove("hidden");
  }
}

function rebuildMessage() {
  const cbs = document.querySelectorAll('input[name="template"]:checked');
  const parts = [];
  for (let i = 0; i < cbs.length; i++) {
    parts.push(cbs[i].dataset.body);
  }
  document.getElementById("agentMessage").value = parts.join("\n\n");
}

function getSelected() {
  const cbs = document.querySelectorAll('input[name="recipient"]:checked');
  const emails = [];
  const names = [];
  for (let i = 0; i < cbs.length; i++) {
    emails.push(cbs[i].value);
    names.push(cbs[i].dataset.contactName);
  }
  return { emails: emails, names: names };
}

function handleAction(mode) {
  const selected = getSelected();
  if (selected.emails.length === 0) {
    showStatus("Selecciona al menos un destinatario.", "error");
    return;
  }

  const isDraft = mode === "draft";
  document.getElementById("forwardBtn").disabled = true;
  document.getElementById("draftBtn").disabled = true;
  showStatus("Obteniendo ticket y conversaciones...", "loading");

  const ctx = { ticket_id: ticketId, auth_token: authToken };

  Promise.all([
    fdClient.request.invokeTemplate("getTicket", { context: ctx }),
    fdClient.request.invokeTemplate("getConversations", { context: ctx })
  ])
  .then(function(res) {
    const ticket = JSON.parse(res[0].response);
    const convs = JSON.parse(res[1].response);
    const msg = document.getElementById("agentMessage").value.trim();
    const body = buildBody(ticket, convs, msg);
    const payload = JSON.stringify({
      body: body,
      to_emails: selected.emails,
      include_quoted_text: false,
      include_original_attachments: true
    });

    if (isDraft) {
      showStatus("Guardando borrador...", "loading");
      return fdClient.request.invokeTemplate("forwardDraft", {
        context: ctx,
        body: payload
      });
    }

    showStatus("Reenviando...", "loading");
    return fdClient.request.invokeTemplate("forwardTicket", {
      context: ctx,
      body: payload
    });
  })
  .then(function() {
    const successMsg = isDraft
      ? "Borrador guardado para " + selected.names.join(", ")
      : "Reenviado a " + selected.names.join(", ");
    showStatus(successMsg, "success");
    setTimeout(function() {
      fdClient.instance.close();
    }, 1500);
  })
  .catch(function(err) {
    showStatus("Error: " + (err.message || JSON.stringify(err)), "error");
    document.getElementById("forwardBtn").disabled = false;
    document.getElementById("draftBtn").disabled = false;
  });
}

function showStatus(text, cls) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = cls;
}

function buildBody(ticket, convs, agentMsg) {
  let h = "";
  if (agentMsg) {
    h += "<div style='margin-bottom:20px;padding:12px 15px;";
    h += "border-left:4px solid #1a73e8;background:#e8eaf6;'>";
    h += "<div style='white-space:pre-wrap;font-size:14px;'>";
    h += esc(agentMsg) + "</div></div>";
    h += "<hr style='border:none;border-top:1px solid #ddd;margin:20px 0;'>";
  }
  h += "<h3>Ticket #" + ticketId + " — " + esc(ticketSubject) + "</h3><hr>";

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

function esc(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}
