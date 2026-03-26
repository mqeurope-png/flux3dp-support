let fdClient;
let ticketId;
let authToken;

app.initialized()
  .then(function(client) {
    fdClient = client;
    return client.data.get("ticket");
  })
  .then(function(data) {
    ticketId = data.ticket.id;
    document.getElementById("ticket-info").textContent =
      "Ticket #" + ticketId + " — " + data.ticket.subject;

    return fdClient.iparams.get();
  })
  .then(function(iparams) {
    // Freshdesk API auth: base64(api_key:X)
    authToken = btoa(iparams.freshdesk_api_key + ":X");

    const btn = document.getElementById("forwardBtn");
    btn.disabled = false;
    btn.addEventListener("click", forwardConversation);
  })
  .catch(function(err) {
    document.getElementById("status").textContent = "Error al iniciar: " + err.message;
    document.getElementById("status").className = "error";
  });

function getSelectedRecipients() {
  const checkboxes = document.querySelectorAll('input[name="recipient"]:checked');
  const emails = [];
  for (let i = 0; i < checkboxes.length; i++) {
    emails.push(checkboxes[i].value);
  }
  return emails;
}

function forwardConversation() {
  const statusDiv = document.getElementById("status");
  const btn = document.getElementById("forwardBtn");

  // Validate at least one recipient selected
  const recipients = getSelectedRecipients();
  if (recipients.length === 0) {
    statusDiv.textContent = "Selecciona al menos un destinatario.";
    statusDiv.className = "error";
    return;
  }

  statusDiv.textContent = "Obteniendo conversaciones...";
  statusDiv.className = "loading";
  btn.disabled = true;

  // Step 1: Get all conversations for this ticket
  fdClient.request.invokeTemplate("getConversations", {
    context: {
      ticket_id: ticketId,
      auth_token: authToken
    }
  })
  .then(function(response) {
    const conversations = JSON.parse(response.response);

    statusDiv.textContent = "Preparando reenvio (" + conversations.length + " mensajes)...";

    // Step 2: Build the email body with the full conversation
    const emailBody = buildConversationHtml(conversations);

    // Step 3: Send as reply to the selected recipients
    return fdClient.request.invokeTemplate("replyTicket", {
      context: {
        ticket_id: ticketId,
        auth_token: authToken
      },
      body: JSON.stringify({
        body: emailBody,
        to_emails: recipients
      })
    });
  })
  .then(function() {
    const names = getSelectedNames();
    statusDiv.textContent = "Conversacion reenviada a " + names;
    statusDiv.className = "success";
    btn.disabled = false;
  })
  .catch(function(err) {
    statusDiv.textContent = "Error: " + err.message;
    statusDiv.className = "error";
    btn.disabled = false;
  });
}

function getSelectedNames() {
  const checkboxes = document.querySelectorAll('input[name="recipient"]:checked');
  const names = [];
  for (let i = 0; i < checkboxes.length; i++) {
    const label = checkboxes[i].parentElement.querySelector("span").textContent;
    names.push(label);
  }
  return names.join(", ");
}

function buildConversationHtml(conversations) {
  let html = "<h3>Conversacion completa del ticket #" + ticketId + "</h3>";
  html += "<hr>";

  if (conversations.length === 0) {
    html += "<p><em>No hay conversaciones en este ticket.</em></p>";
    return html;
  }

  // Sort by created_at ascending (oldest first)
  conversations.sort(function(a, b) {
    return new Date(a.created_at) - new Date(b.created_at);
  });

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    const date = new Date(conv.created_at).toLocaleString("es-ES");
    const from = conv.from_email || "Agente";
    const source = getSourceLabel(conv.source);

    html += "<div style='margin-bottom:15px;padding:10px;border-left:3px solid #2196F3;background:#f9f9f9;'>";
    html += "<p style='margin:0 0 5px 0;color:#666;font-size:12px;'>";
    html += "<strong>" + from + "</strong> — " + date + " (" + source + ")";
    html += "</p>";
    html += "<div>" + (conv.body || conv.body_text || "") + "</div>";
    html += "</div>";
  }

  return html;
}

function getSourceLabel(source) {
  const labels = {
    0: "Respuesta",
    1: "Nota",
    2: "Email",
    3: "Tweet",
    4: "Facebook",
    5: "Telefono",
    6: "Chat",
    7: "Mobihelp",
    8: "Portal",
    9: "Foro"
  };
  return labels[source] || "Otro";
}
