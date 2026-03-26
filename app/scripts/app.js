let fdClient;
let ticketId;
let ticketSubject;
let authToken;
let pendingDialogData = null;

app.initialized()
  .then(function(client) {
    fdClient = client;

    // Listen for messages from the dialog
    fdClient.instance.receive(function(event) {
      const msg = event.helper.getMessage();

      if (msg.action === "dialogReady" && pendingDialogData) {
        // Dialog is ready, send it the data
        fdClient.instance.send({
          message: pendingDialogData
        });
      }

      if (msg.action === "forwardResult") {
        const statusDiv = document.getElementById("status");
        const btn = document.getElementById("forwardBtn");
        if (msg.success) {
          if (msg.mode === "draft") {
            statusDiv.textContent = "Borrador guardado para " + msg.names;
          } else {
            statusDiv.textContent = "Reenviado a " + msg.names;
          }
          statusDiv.className = "success";
        } else {
          statusDiv.textContent = "Error: " + msg.error;
          statusDiv.className = "error";
        }
        btn.disabled = false;
      }
    });

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
        checkbox.dataset.contactName = name;
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
    btn.addEventListener("click", openForwardDialog);
  })
  .catch(function(err) {
    document.getElementById("status").textContent = "Error al iniciar: " + (err.message || JSON.stringify(err));
    document.getElementById("status").className = "error";
  });

function getSelectedRecipients() {
  const checkboxes = document.querySelectorAll('input[name="recipient"]:checked');
  const emails = [];
  const names = [];
  for (let i = 0; i < checkboxes.length; i++) {
    emails.push(checkboxes[i].value);
    names.push(checkboxes[i].dataset.contactName);
  }
  return { emails: emails, names: names };
}

function openForwardDialog() {
  const statusDiv = document.getElementById("status");

  const selected = getSelectedRecipients();
  if (selected.emails.length === 0) {
    statusDiv.textContent = "Selecciona al menos un destinatario.";
    statusDiv.className = "error";
    return;
  }

  statusDiv.textContent = "";
  statusDiv.className = "";

  // Prepare data for the dialog
  pendingDialogData = {
    action: "dialogData",
    ticketId: ticketId,
    ticketSubject: ticketSubject,
    authToken: authToken,
    recipientEmails: selected.emails,
    recipientNames: selected.names
  };

  // Open the dialog
  fdClient.interface.trigger("showDialog", {
    title: "Reenviar conversación",
    template: "dialog.html"
  }).catch(function(err) {
    statusDiv.textContent = "Error al abrir diálogo: " + (err.message || JSON.stringify(err));
    statusDiv.className = "error";
  });
}
