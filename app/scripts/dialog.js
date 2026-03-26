let fdClient;
let dialogData = null;

app.initialized()
  .then(function(client) {
    fdClient = client;

    // Listen for data from the sidebar
    fdClient.instance.receive(function(event) {
      const msg = event.helper.getMessage();
      if (msg.action === "dialogData") {
        dialogData = msg;
        renderRecipients(msg.recipientNames, msg.recipientEmails);
        document.getElementById("forwardBtn").disabled = false;
        document.getElementById("draftBtn").disabled = false;
      }
    });

    // Request data from the sidebar
    fdClient.instance.send({
      message: { action: "dialogReady" }
    });

    // Button listeners
    document.getElementById("forwardBtn").addEventListener("click", function() {
      handleAction("forward");
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

function renderRecipients(names, emails) {
  const list = document.getElementById("recipients-list");
  list.innerHTML = "";
  for (let i = 0; i < names.length; i++) {
    const tag = document.createElement("span");
    tag.className = "recipient-tag";
    tag.textContent = names[i];
    tag.title = emails[i];
    list.appendChild(tag);
  }
}

function handleAction(mode) {
  if (!dialogData) return;

  const statusDiv = document.getElementById("status");
  const forwardBtn = document.getElementById("forwardBtn");
  const draftBtn = document.getElementById("draftBtn");

  forwardBtn.disabled = true;
  draftBtn.disabled = true;

  showStatus("Obteniendo ticket y conversaciones...", "loading");

  const ctx = {
    ticket_id: dialogData.ticketId,
    auth_token: dialogData.authToken
  };

  Promise.all([
    fdClient.request.invokeTemplate("getTicket", { context: ctx }),
    fdClient.request.invokeTemplate("getConversations", { context: ctx })
  ])
  .then(function(results) {
    const ticket = JSON.parse(results[0].response);
    const conversations = JSON.parse(results[1].response);

    const agentMsg = document.getElementById("agentMessage").value.trim();
    const emailBody = buildFullEmailHtml(
      dialogData.ticketId,
      dialogData.ticketSubject,
      ticket,
      conversations,
      agentMsg
    );

    if (mode === "forward") {
      showStatus("Reenviando...", "loading");
      return fdClient.request.invokeTemplate("forwardTicket", {
        context: ctx,
        body: JSON.stringify({
          body: emailBody,
          to_emails: dialogData.recipientEmails,
          include_quoted_text: false,
          include_original_attachments: true
        })
      }).then(function() {
        return { mode: "forward" };
      });
    } else {
      showStatus("Guardando borrador...", "loading");
      return fdClient.request.invokeTemplate("createDraft", {
        context: ctx,
        body: JSON.stringify({
          body: emailBody,
          to_emails: dialogData.recipientEmails
        })
      }).then(function() {
        return { mode: "draft" };
      });
    }
  })
  .then(function(result) {
    const names = dialogData.recipientNames.join(", ");
    if (result.mode === "forward") {
      showStatus("Reenviado a " + names, "success");
    } else {
      showStatus("Borrador guardado — revísalo en el ticket", "success");
    }
    // Notify sidebar of success
    fdClient.instance.send({
      message: {
        action: "forwardResult",
        success: true,
        mode: result.mode,
        names: names
      }
    });
    // Close dialog after 1.5 seconds
    setTimeout(function() {
      fdClient.instance.close();
    }, 1500);
  })
  .catch(function(err) {
    const errMsg = err.message || JSON.stringify(err);
    showStatus("Error: " + errMsg, "error");
    forwardBtn.disabled = false;
    draftBtn.disabled = false;

    fdClient.instance.send({
      message: {
        action: "forwardResult",
        success: false,
        error: errMsg
      }
    });
  });
}

function showStatus(text, className) {
  const statusDiv = document.getElementById("status");
  statusDiv.textContent = text;
  statusDiv.className = className;
}

function buildFullEmailHtml(ticketId, ticketSubject, ticket, conversations, agentMessage) {
  let html = "";

  // Agent's personal message at the top
  if (agentMessage) {
    html += "<div style='margin-bottom:20px;padding:12px 15px;border-left:4px solid #1a73e8;background:#e8eaf6;border-radius:4px;'>";
    html += "<div style='white-space:pre-wrap;font-size:14px;line-height:1.5;'>" + escapeHtml(agentMessage) + "</div>";
    html += "</div>";
    html += "<hr style='border:none;border-top:1px solid #ddd;margin:20px 0;'>";
  }

  html += "<h3 style='color:#333;'>Ticket #" + ticketId + " — " + escapeHtml(ticketSubject) + "</h3>";
  html += "<hr style='border:none;border-top:1px solid #ddd;'>";

  // Original ticket description
  const ticketDate = new Date(ticket.created_at).toLocaleString("es-ES");
  const requester = ticket.requester || {};
  const ticketFrom = requester.email || requester.name || "Cliente";

  html += "<div style='margin-bottom:15px;padding:10px;border-left:3px solid #f57c00;background:#fff8e1;'>";
  html += "<p style='margin:0 0 5px 0;color:#666;font-size:12px;'>";
  html += "<strong>" + escapeHtml(ticketFrom) + "</strong> — " + ticketDate + " (Mensaje original)";
  html += "</p>";
  html += "<div>" + (ticket.description || ticket.description_text || "") + "</div>";
  html += "</div>";

  // Conversations (public only)
  if (conversations.length > 0) {
    conversations.sort(function(a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      if (conv.private) { continue; }

      const date = new Date(conv.created_at).toLocaleString("es-ES");
      const from = conv.from_email || "Agente";

      html += "<div style='margin-bottom:15px;padding:10px;border-left:3px solid #2196F3;background:#e3f2fd;'>";
      html += "<p style='margin:0 0 5px 0;color:#666;font-size:12px;'>";
      html += "<strong>" + escapeHtml(from) + "</strong> — " + date;
      html += "</p>";
      html += "<div>" + (conv.body || conv.body_text || "") + "</div>";
      html += "</div>";
    }
  }

  return html;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
