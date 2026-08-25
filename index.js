const webdav = require("webdav-server").v2;
const { spawn } = require("child_process");
const fs = require("fs");
const { Jimp } = require("jimp");
const sax = require("sax");
const escape = require("escape-html");
const CONFIG = require("./config.json");

const cookie = process.argv[2];
const FILETYPE = /(?<=\.)[^.]+$/;
const MAX_SIZE = 2 << 20;

let imgdircnt = 0;

class WebDAV extends webdav.VirtualFileSystem {
  _openWriteStream(path, ctx, callback) {
    const imgdir = __dirname + "/media/" + ++imgdircnt;
    const pandoc = spawn(
      "pandoc",
      ["--extract-media=" + imgdir, "-f", path.fileName().match(FILETYPE)[0]],
      {
        cwd: __dirname
      }
    );
    const images = {};
    const htmlfile = fs.createWriteStream(
      __dirname + "/html/" + path.fileName().replace(FILETYPE, "html")
    );
    let html = "";
    pandoc.stdout
      .on("data", function (chunk) {
        html += chunk.toString();
      })
      .on("end", async function () {
        try {
          for (const image of fs.readdirSync(imgdir + "/media")) {
            const body = new FormData();
            body.set("dir_id", CONFIG.media_folder);
            body.set("upload_name", "file");
            let img = fs.readFileSync(imgdir + "/media/" + image);
            for (let imgBuf; img.length > MAX_SIZE; ) {
              imgBuf ??= await Jimp.fromBuffer(img);
              imgBuf.scale(0.9);
              img = await imgBuf.getBuffer(imgBuf.mime);
            }
            body.append("file", new File([img], image));
            const {
              data: {
                upload: { fk_t172_media: media }
              }
            } = await (
              await fetch(
                `${CONFIG.server}/media/d/2739?action=file_uploadFile`,
                {
                  method: "POST",
                  headers: { cookie },
                  body
                }
              )
            ).json();
            const { data: wlib } = await (
              await fetch(
                `${CONFIG.server}/media/d?action=file_createIntegrations`,
                {
                  method: "POST",
                  headers: { cookie, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    be_field: "beschreibung1",
                    be_label: "Text",
                    fk_elem: 2997,
                    fk_object: CONFIG.media_object,
                    variants: [media]
                  })
                }
              )
            ).json();
            images[image] = wlib[media];
          }
          fs.rmSync(imgdir, {
            recursive: true,
            force: true
          });
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        sax
          .createStream(true)
          .on("opentag", function (node) {
            switch (node.name) {
              case "html":
                break;
              case "img":
                htmlfile.write(
                  `<span class="wlib-media" id="${images[node.attributes.src.match(/(?<=\/)[^/]+$/)[0]]}">&nbsp;</span>`
                );
                break;
              default:
                htmlfile.write(`<${node.name}`);
                for (const a in node.attributes)
                  htmlfile.write(` ${a}="${escape(node.attributes[a])}"`);
                htmlfile.write(`>`);
            }
          })
          .on("text", function (text) {
            htmlfile.write(escape(text));
          })
          .on("closetag", function (name) {
            switch (name) {
              case "html":
              case "img":
                break;
              default:
                htmlfile.write(`</${name}>`);
            }
          })
          .end(`<html>${html}</html>`);
      });
    callback(null, pandoc.stdin);
  }
}

const server = new webdav.WebDAVServer();
server.setFileSystemSync("/", new WebDAV());
server.start(function (httpServer) {
  console.log("WebDAV server running", httpServer.address());
});
