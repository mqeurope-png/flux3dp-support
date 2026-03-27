const https = require("https");

exports = {
  forwardWithAttachments: function(args) {
    const data = args.data;
    const iparams = args.iparams;
    const domain = iparams.freshdesk_domain;
    const token = Buffer.from(iparams.freshdesk_api_key + ":X").toString("base64");
    const boundary = "----FDKBoundary" + Date.now();
    const parts = [];

    // body field
    parts.push(fieldPart(boundary, "body", data.body));

    // to_emails[] fields
    for (let i = 0; i < data.to_emails.length; i++) {
      parts.push(fieldPart(boundary, "to_emails[]", data.to_emails[i]));
    }

    // include flags
    parts.push(fieldPart(boundary, "include_quoted_text", "false"));
    parts.push(fieldPart(boundary, "include_original_attachments", "true"));

    // attachments[] files
    if (data.attachments && data.attachments.length > 0) {
      for (let i = 0; i < data.attachments.length; i++) {
        const file = data.attachments[i];
        parts.push(filePart(boundary, "attachments[]", file.name, file.type, file.base64));
      }
    }

    // closing boundary
    parts.push("--" + boundary + "--\r\n");

    const bodyBuffer = Buffer.concat(parts.map(function(p) {
      if (Buffer.isBuffer(p)) { return p; }
      return Buffer.from(p, "utf8");
    }));

    const options = {
      hostname: domain,
      port: 443,
      path: "/api/v2/tickets/" + data.ticket_id + "/forward",
      method: "POST",
      headers: {
        "Authorization": "Basic " + token,
        "Content-Type": "multipart/form-data; boundary=" + boundary,
        "Content-Length": bodyBuffer.length
      }
    };

    return new Promise(function(resolve, reject) {
      const req = https.request(options, function(res) {
        let responseBody = "";
        res.on("data", function(chunk) { responseBody += chunk; });
        res.on("end", function() {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            renderData(null, { status: res.statusCode, response: responseBody });
            resolve();
          } else {
            renderData({ message: "HTTP " + res.statusCode + ": " + responseBody });
            reject();
          }
        });
      });
      req.on("error", function(err) {
        renderData({ message: err.message });
        reject();
      });
      req.write(bodyBuffer);
      req.end();
    });
  }
};

function fieldPart(boundary, name, value) {
  return "--" + boundary + "\r\n" +
    "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" +
    value + "\r\n";
}

function filePart(boundary, name, filename, contentType, base64Data) {
  const header = "--" + boundary + "\r\n" +
    "Content-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\n" +
    "Content-Type: " + (contentType || "application/octet-stream") + "\r\n\r\n";
  const fileBuffer = Buffer.from(base64Data, "base64");
  const footer = "\r\n";
  return Buffer.concat([
    Buffer.from(header, "utf8"),
    fileBuffer,
    Buffer.from(footer, "utf8")
  ]);
}
