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

  statusDiv.textContent = "Reenviando ticket...";
  statusDiv.className = "loading";
  btn.disabled = true;

  const ctx = { ticket_id: ticketId, auth_token: authToken };

  // Forward ticket — Freshdesk handles the conversation quoting
  fdClient.request.invokeTemplate("forwardTicket", {
    context: ctx,
    body: JSON.stringify({
      body: "<p>Reenvio del ticket #" + ticketId + " — " + ticketSubject + "</p>",
      to_emails: recipients,
      include_quoted_text: true,
      include_original_attachments: true
    })
  })
  .then(function() {
    const names = getSelectedNames();
    statusDiv.textContent = "Ticket reenviado a " + names;
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
