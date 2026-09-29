// multer для демо: файл из FormData кладётся в хранилище браузера
const { UPLOAD_DIR } = require('./fs');
function multer() {
  return {
    single: () => (req, _res, next) => {
      const f = req._file;
      if (f) {
        const ext = (String(f.name).match(/\.[a-z0-9]{1,10}$/i) || [''])[0].toLowerCase();
        const key = `u/${globalThis.crypto.randomUUID()}${ext}`;
        globalThis.__DEMO.putFile(key, f);
        req.file = { originalname: f.name, mimetype: f.type || 'application/octet-stream', size: f.size, path: `${UPLOAD_DIR}/${key}` };
      }
      next();
    },
  };
}
multer.diskStorage = (o) => o;
module.exports = multer;
