let fdClient;

app.initialized()
  .then(function(client) {
    fdClient = client;
    return client.data.get("ticket");
  })
  .then(function(data) {
    document.getElementById("ticket-info").textContent =
      "Ticket #" + data.ticket.id + " — " + data.ticket.subject;
    const btn = document.getElementById("forwardBtn");
    btn.disabled = false;
    btn.addEventListener("click", function() {
      fdClient.interface.trigger("showDialog", {
        title: "Reenviar conversación",
        template: "dialog.html"
      }).catch(function(err) {
        const st = document.getElementById("status");
        st.textContent = "Error: " + (err.message || JSON.stringify(err));
        st.className = "error";
      });
    });
  })
  .catch(function(err) {
    document.getElementById("status").textContent =
      "Error al iniciar: " + (err.message || JSON.stringify(err));
    document.getElementById("status").className = "error";
  });
