// Небольшой аналог express.Router: тот же порядок маршрутов и обработка ошибок
function compile(path) {
  if (path === '/' ) return { re: /^/, keys: [], prefixOnly: true };
  const keys = [];
  const src = path.replace(/\/:([A-Za-z0-9_]+)/g, (_m, k) => { keys.push(k); return '/([^/]+)'; });
  return { re: new RegExp('^' + src), keys };
}

function Router() {
  const stack = [];
  const router = (req, res, done) => handle(stack, req, res, done);
  router.use = (...args) => {
    const path = typeof args[0] === 'string' ? args.shift() : '/';
    stack.push({ method: null, path, ...compile(path), handlers: args });
    return router;
  };
  for (const m of ['get', 'post', 'put', 'delete']) {
    router[m] = (path, ...handlers) => { stack.push({ method: m.toUpperCase(), path, ...compile(path), handlers, exact: true }); return router; };
  }
  return router;
}

function handle(stack, req, res, done) {
  let i = 0;
  const next = (err) => {
    if (err) return done(err);
    if (res.ended) return;
    while (i < stack.length) {
      const layer = stack[i++];
      if (layer.method && layer.method !== req.method) continue;
      const m = req.path.match(layer.re);
      if (!m) continue;
      const rest = req.path.slice(m[0].length);
      if (layer.exact && rest !== '' && rest !== '/') continue;
      if (!layer.exact && rest !== '' && !rest.startsWith('/') && layer.path !== '/') continue;
      const params = { ...req.params };
      layer.keys.forEach((k, j) => { params[k] = decodeURIComponent(m[j + 1]); });
      const savedPath = req.path;
      const savedParams = req.params;
      req.params = params;
      if (!layer.exact && layer.path !== '/') req.path = rest || '/';
      return runHandlers(layer.handlers, req, res, (e) => { req.path = savedPath; req.params = savedParams; next(e); });
    }
    done();
  };
  next();
}

function runHandlers(handlers, req, res, out) {
  let k = 0;
  const step = (err) => {
    if (err) return out(err);
    if (res.ended) return;
    const h = handlers[k++];
    if (!h) return out();
    try { h(req, res, step); } catch (e) { out(e); }
  };
  step();
}

const express = () => { throw new Error('not supported in demo'); };
express.Router = Router;
express.json = () => (_q, _r, n) => n();
express.static = () => (_q, _r, n) => n();
module.exports = express;
module.exports.handle = handle;
