const webdav = require("webdav-server").v2;
const { spawn } = require("child_process");
const fs = require("fs");
const { Jimp } = require("jimp");

const cookie = process.argv[2];
const FILETYPE = /(?<=\.)[^.]+$/;
const MAX_WIDTH = 1000;

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
    pandoc.stdout.pipe(
      fs.createWriteStream(
        __dirname + "/html/" + path.fileName().replace(FILETYPE, "html")
      )
    );
    pandoc.stdout.on("end", async function () {
      try {
        for (const image of fs.readdirSync(imgdir + "/media")) {
          const body = new FormData();
          body.set("dir_id", "37849");
          body.set("upload_name", "file");
          const img = await Jimp.fromBuffer(
            fs.readFileSync(imgdir + "/media/" + image)
          );
          if (img.width > MAX_WIDTH) img.resize({ w: MAX_WIDTH });
          body.append("file", new File([await img.getBuffer(img.mime)], image));
          fetch(
            "https://lukas.edith-cms.de/ekiba/media/d/2739?action=file_uploadFile",
            {
              method: "POST",
              headers: { cookie },
              body
            }
          );
        }
        fs.rmSync(imgdir, {
          recursive: true,
          force: true
        });
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    });
    callback(null, pandoc.stdin);
  }
}

const server = new webdav.WebDAVServer({
  hostname: "localhost",
  httpAuthentication: {
    askForAuthentication() {
      return [];
    },
    getUser(ctx, callback) {
      callback(null, { uid: "HeikoTheißen", username: "HeikoTheißen" });
    }
  }
});
server.setFileSystemSync("/", new WebDAV());
server.start(function (httpServer) {
  console.log("WebDAV server running", httpServer.address());
});
