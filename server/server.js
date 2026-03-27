exports = {
  forwardWithAttachments: function(args) {
    const data = args.data;
    const iparams = args.iparams;
    const domain = iparams.freshdesk_domain;
    const token = Buffer.from(iparams.freshdesk_api_key + ":X").toString("base64");
    const url = "https://" + domain + "/api/v2/tickets/" + data.ticket_id + "/forward";

    const formData = {
      body: data.body,
      include_quoted_text: "false",
      include_original_attachments: "true"
    };

    // Add each email as to_emails[]
    const emails = data.to_emails || [];
    if (emails.length === 1) {
      formData["to_emails[]"] = emails[0];
    } else {
      formData["to_emails[]"] = emails;
    }

    // Add attachments
    const attachments = data.attachments || [];
    if (attachments.length === 1) {
      formData["attachments[]"] = {
        value: Buffer.from(attachments[0].base64, "base64"),
        options: {
          filename: attachments[0].name,
          contentType: attachments[0].type || "application/octet-stream"
        }
      };
    } else if (attachments.length > 1) {
      const files = [];
      for (let i = 0; i < attachments.length; i++) {
        files.push({
          value: Buffer.from(attachments[i].base64, "base64"),
          options: {
            filename: attachments[i].name,
            contentType: attachments[i].type || "application/octet-stream"
          }
        });
      }
      formData["attachments[]"] = files;
    }

    return $request.post(url, {
      headers: {
        "Authorization": "Basic " + token
      },
      formData: formData
    })
    .then(function() {
      renderData(null, { success: true });
    })
    .catch(function(err) {
      renderData({ message: err.message || JSON.stringify(err) });
    });
  }
};
