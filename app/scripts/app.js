let fdClient;
let ticketId;
let ticketSubject;
let authToken;

app.initialized()
  .then(function(client) {
    fdClient = client;
    return client.data.get("ticket");
  })
  .then(function(data) {
    ticketId = data.ticket.id;
    ticketSubject = data.ticket.subject;
    document.getElementById("ticket-info").textContent =
      "Ticket #" + ticketId + " — " + ticketSubject;

    return fdClient.iparams.get();
  })
  .then(function(iparams) {
    authToken = btoa(iparams.freshdesk_api_key + ":X");

    // Build contact checkboxes from iparams
    const contactsList = document.getElementById("contacts-list");
    for (let i = 1; i <= 4; i++) {
      const name = iparams["contact_" + i + "_name"];
      const email = iparams["contact_" + i + "_email"];
      if (name && email) {
        const label = document.createElement("label");
        label.className = "contact-option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = "recipient";
        checkbox.value = email;
        if (iparams["contact_" + i + "_default"]) {
          checkbox.checked = true;
        }

        const span = document.createElement("span");
        span.textContent = name;

        label.appendChild(checkbox);
        label.appendChild(span);
        contactsList.appendChild(label);
      }
    }

    const btn = document.getElementById("forwardBtn");
    btn.disabled = false;
    btn.addEventListener("click", forwardConversation);
  })
  .catch(function(err) {
    document.getElementById("status").textContent = "Error al iniciar: " + (err.message || JSON.stringify(err));
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

  const recipients = getSelectedRecipients();
  if (recipients.length === 0) {
    statusDiv.textContent = "Selecciona al menos un destinatario.";
    statusDiv.className = "error";
    return;
  }

  statusDiv.textContent = "Obteniendo ticket y conversaciones...";
  statusDiv.className = "loading";
  btn.disabled = true;

  const ctx = { ticket_id: ticketId, auth_token: authToken };

  // Get ticket details AND conversations in parallel
  Promise.all([
    fdClient.request.invokeTemplate("getTicket", { context: ctx }),
    fdClient.request.invokeTemplate("getConversations", { context: ctx })
  ])
  .then(function(results) {
    const ticket = JSON.parse(results[0].response);
    const conversations = JSON.parse(results[1].response);

    const totalMessages = 1 + conversations.length;
    statusDiv.textContent = "Preparando reenvio (" + totalMessages + " mensajes)...";

    // Build email body: ticket description + all conversations
    const emailBody = buildFullEmailHtml(ticket, conversations);

    return fdClient.request.invokeTemplate("replyTicket", {
      context: ctx,
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
    statusDiv.textContent = "Error: " + (err.message || JSON.stringify(err));
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

function buildFullEmailHtml(ticket, conversations) {
  let html = "<h3>Ticket #" + ticketId + " — " + ticketSubject + "</h3>";
  html += "<hr>";

  // 1. Original ticket description (first message)
  const ticketDate = new Date(ticket.created_at).toLocaleString("es-ES");
  const ticketFrom = ticket.requester ? (ticket.requester.email || ticket.requester.name || "Cliente") : "Cliente";

  html += "<div style='margin-bottom:15px;padding:10px;border-left:3px solid #f57c00;background:#fff8e1;'>";
  html += "<p style='margin:0 0 5px 0;color:#666;font-size:12px;'>";
  html += "<strong>" + ticketFrom + "</strong> — " + ticketDate + " (Mensaje original)";
  html += "</p>";
  html += "<div>" + (ticket.description || ticket.description_text || "") + "</div>";
  html += "</div>";

  // 2. All conversations (replies and notes)
  if (conversations.length > 0) {
    conversations.sort(function(a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      const date = new Date(conv.created_at).toLocaleString("es-ES");
      const from = conv.from_email || "Agente";
      const isPrivate = conv.private;
      const borderColor = isPrivate ? "#9e9e9e" : "#2196F3";
      const bgColor = isPrivate ? "#f5f5f5" : "#e3f2fd";
      const tag = isPrivate ? "Nota privada" : "Respuesta";

      html += "<div style='margin-bottom:15px;padding:10px;border-left:3px solid " + borderColor + ";background:" + bgColor + ";'>";
      html += "<p style='margin:0 0 5px 0;color:#666;font-size:12px;'>";
      html += "<strong>" + from + "</strong> — " + date + " (" + tag + ")";
      html += "</p>";
      html += "<div>" + (conv.body || conv.body_text || "") + "</div>";
      html += "</div>";
    }
  }

  return html;
}
