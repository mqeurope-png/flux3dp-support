let fdClient;
let ticketId;
let ticketSubject;
let authToken;
let cannedList = [];

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

    buildContacts(iparams);
    setupButtons();
    loadCanned();
  })
  .catch(function(err) {
    showStatus("Error al iniciar: " + (err.message || JSON.stringify(err)), "error");
  });

function buildContacts(iparams) {
  const list = document.getElementById("contacts-list");
  for (let i = 1; i <= 4; i++) {
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
}

function setupButtons() {
  document.getElementById("forwardBtn").disabled = false;
  document.getElementById("draftBtn").disabled = false;
  document.getElementById("forwardBtn").addEventListener("click", function() {
    handleAction("forward");
  });
  document.getElementById("draftBtn").addEventListener("click", function() {
    handleAction("draft");
  });
}

function loadCanned() {
  const ctx = { auth_token: authToken };
  fdClient.request.invokeTemplate("getCannedFolders", { context: ctx })
    .then(function(res) {
      const folders = JSON.parse(res.response);
      if (!folders || folders.length === 0) { return; }

      const promises = [];
      for (let i = 0; i < folders.length; i++) {
        const fCtx = { auth_token: authToken, folder_id: folders[i].id };
        promises.push(
          fdClient.request.invokeTemplate("getCannedResponses", { context: fCtx })
            .then(function(r) {
              return { folder: folders[i].name, responses: JSON.parse(r.response) };
            })
        );
      }
      return Promise.all(promises);
    })
    .then(function(folderData) {
      if (!folderData) { return; }

      const select = document.getElementById("cannedSelect");
      for (let f = 0; f < folderData.length; f++) {
        const grp = folderData[f];
        if (!grp.responses || grp.responses.length === 0) { continue; }

        const optgroup = document.createElement("optgroup");
        optgroup.label = grp.folder;

        for (let r = 0; r < grp.responses.length; r++) {
          const cr = grp.responses[r];
          cannedList.push({ id: cr.id, title: cr.title, content: cr.content_html || cr.content });
          const opt = document.createElement("option");
          opt.value = String(cannedList.length - 1);
          opt.textContent = cr.title;
          optgroup.appendChild(opt);
        }
        select.appendChild(optgroup);
      }

      if (cannedList.length > 0) {
        document.getElementById("canned-section").classList.remove("hidden");
        select.addEventListener("change", function() {
          if (this.value === "") { return; }
          const idx = parseInt(this.value, 10);
          const ta = document.getElementById("agentMessage");
          ta.value = stripHtml(cannedList[idx].content);
          ta.focus();
        });
      }
    })
    .catch(function() {
      // API not available on this plan — silently hide dropdown
    });
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.textContent || "";
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

  const fBtn = document.getElementById("forwardBtn");
  const dBtn = document.getElementById("draftBtn");
  fBtn.disabled = true;
  dBtn.disabled = true;
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

    if (mode === "forward") {
      showStatus("Reenviando...", "loading");
      return fdClient.request.invokeTemplate("forwardTicket", {
        context: ctx,
        body: JSON.stringify({
          body: body,
          to_emails: selected.emails,
          include_quoted_text: false,
          include_original_attachments: true
        })
      }).then(function() { return "forward"; });
    }
    showStatus("Guardando borrador...", "loading");
    return fdClient.request.invokeTemplate("createDraft", {
      context: ctx,
      body: JSON.stringify({
        body: body,
        to_emails: selected.emails
      })
    }).then(function() { return "draft"; });
  })
  .then(function(result) {
    const n = selected.names.join(", ");
    if (result === "forward") {
      showStatus("Reenviado a " + n, "success");
    } else {
      showStatus("Borrador guardado", "success");
    }
    setTimeout(function() {
      fdClient.instance.close();
    }, 1500);
  })
  .catch(function(err) {
    showStatus("Error: " + (err.message || JSON.stringify(err)), "error");
    fBtn.disabled = false;
    dBtn.disabled = false;
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
