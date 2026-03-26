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
    btn.addEventListener("click", openModal);

    document.getElementById("modalClose").addEventListener("click", closeModal);
    document.getElementById("modal-overlay").addEventListener("click", function(e) {
      if (e.target === this) { closeModal(); }
    });
    document.getElementById("modalForwardBtn").addEventListener("click", function() {
      handleAction("forward");
    });
    document.getElementById("modalDraftBtn").addEventListener("click", function() {
      handleAction("draft");
    });
  })
  .catch(function(err) {
    document.getElementById("status").textContent =
      "Error al iniciar: " + (err.message || JSON.stringify(err));
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

function openModal() {
  const statusDiv = document.getElementById("status");
  const selected = getSelectedRecipients();
  if (selected.emails.length === 0) {
    statusDiv.textContent = "Selecciona al menos un destinatario.";
    statusDiv.className = "error";
    return;
  }
  statusDiv.textContent = "";
  statusDiv.className = "";

  const list = document.getElementById("modal-recipients-list");
  list.innerHTML = "";
  for (let i = 0; i < selected.names.length; i++) {
    const tag = document.createElement("span");
    tag.className = "recipient-tag";
    tag.textContent = selected.names[i];
    list.appendChild(tag);
  }

  document.getElementById("agentMessage").value = "";
  document.getElementById("modal-status").textContent = "";
  document.getElementById("modal-status").className = "";
  document.getElementById("modalForwardBtn").disabled = false;
  document.getElementById("modalDraftBtn").disabled = false;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

function handleAction(mode) {
  const modalStatus = document.getElementById("modal-status");
  const fwdBtn = document.getElementById("modalForwardBtn");
  const dftBtn = document.getElementById("modalDraftBtn");
  const selected = getSelectedRecipients();

  fwdBtn.disabled = true;
  dftBtn.disabled = true;
  modalStatus.textContent = "Obteniendo ticket y conversaciones...";
  modalStatus.className = "loading";

  const ctx = { ticket_id: ticketId, auth_token: authToken };

  Promise.all([
    fdClient.request.invokeTemplate("getTicket", { context: ctx }),
    fdClient.request.invokeTemplate("getConversations", { context: ctx })
  ])
  .then(function(results) {
    const ticket = JSON.parse(results[0].response);
    const conversations = JSON.parse(results[1].response);
    const agentMsg = document.getElementById("agentMessage").value.trim();
    const emailBody = buildEmailBody(ticket, conversations, agentMsg);

    if (mode === "forward") {
      modalStatus.textContent = "Reenviando...";
      return fdClient.request.invokeTemplate("forwardTicket", {
        context: ctx,
        body: JSON.stringify({
          body: emailBody,
          to_emails: selected.emails,
          include_quoted_text: false,
          include_original_attachments: true
        })
      }).then(function() { return "forward"; });
    } else {
      modalStatus.textContent = "Guardando borrador...";
      return fdClient.request.invokeTemplate("createDraft", {
        context: ctx,
        body: JSON.stringify({
          body: emailBody,
          to_emails: selected.emails
        })
      }).then(function() { return "draft"; });
    }
  })
  .then(function(result) {
    const names = selected.names.join(", ");
    if (result === "forward") {
      modalStatus.textContent = "Reenviado a " + names;
    } else {
      modalStatus.textContent = "Borrador guardado";
    }
    modalStatus.className = "success";
    setTimeout(function() {
      closeModal();
      const st = document.getElementById("status");
      if (result === "forward") {
        st.textContent = "Reenviado a " + names;
      } else {
        st.textContent = "Borrador guardado";
      }
      st.className = "success";
    }, 1200);
  })
  .catch(function(err) {
    modalStatus.textContent = "Error: " + (err.message || JSON.stringify(err));
    modalStatus.className = "error";
    fwdBtn.disabled = false;
    dftBtn.disabled = false;
  });
}

function buildEmailBody(ticket, conversations, msg) {
  let html = "";
  if (msg) {
    html += "<div style='margin-bottom:20px;padding:12px 15px;";
    html += "border-left:4px solid #1a73e8;background:#e8eaf6;border-radius:4px;'>";
    html += "<div style='white-space:pre-wrap;font-size:14px;line-height:1.5;'>";
    html += escapeHtml(msg) + "</div></div>";
    html += "<hr style='border:none;border-top:1px solid #ddd;margin:20px 0;'>";
  }

  html += "<h3 style='color:#333;'>Ticket #" + ticketId;
  html += " — " + escapeHtml(ticketSubject) + "</h3>";
  html += "<hr style='border:none;border-top:1px solid #ddd;'>";

  const ticketDate = new Date(ticket.created_at).toLocaleString("es-ES");
  const req = ticket.requester || {};
  const from = req.email || req.name || "Cliente";
  html += "<div style='margin-bottom:15px;padding:10px;";
  html += "border-left:3px solid #f57c00;background:#fff8e1;'>";
  html += "<p style='margin:0 0 5px 0;color:#666;font-size:12px;'>";
  html += "<strong>" + escapeHtml(from) + "</strong> — ";
  html += ticketDate + " (Mensaje original)</p>";
  html += "<div>" + (ticket.description || "") + "</div></div>";

  if (conversations.length > 0) {
    conversations.sort(function(a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });
    for (let i = 0; i < conversations.length; i++) {
      const c = conversations[i];
      if (c.private) { continue; }
      const d = new Date(c.created_at).toLocaleString("es-ES");
      const f = c.from_email || "Agente";
      html += "<div style='margin-bottom:15px;padding:10px;";
      html += "border-left:3px solid #2196F3;background:#e3f2fd;'>";
      html += "<p style='margin:0 0 5px 0;color:#666;font-size:12px;'>";
      html += "<strong>" + escapeHtml(f) + "</strong> — " + d + "</p>";
      html += "<div>" + (c.body || c.body_text || "") + "</div></div>";
    }
  }
  return html;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
