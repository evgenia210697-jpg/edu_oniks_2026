// Замена встроенного node:sqlite для демо: та же база SQLite, но в браузере (sql.js)
const norm = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));

class DatabaseSync {
  constructor() {
    const SQL = globalThis.__DEMO.SQL;
    const bytes = globalThis.__DEMO.dbBytes;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    globalThis.__DEMO.db = this;
  }
  exec(sql) { globalThis.__DEMO.dirty = true; this.db.exec(sql); }
  prepare(sql) {
    const db = this.db;
    const withStmt = (params, fn) => {
      const st = db.prepare(sql);
      try { st.bind(norm(params)); return fn(st); } finally { st.free(); }
    };
    return {
      get: (...p) => withStmt(p, (st) => (st.step() ? st.getAsObject() : undefined)),
      all: (...p) => withStmt(p, (st) => { const out = []; while (st.step()) out.push(st.getAsObject()); return out; }),
      run: (...p) => {
        withStmt(p, (st) => st.step());
        globalThis.__DEMO.dirty = true;
        const changes = db.getRowsModified();
        const lastInsertRowid = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
        return { changes, lastInsertRowid };
      },
    };
  }
  close() {}
}

module.exports = { DatabaseSync, backup: async () => {} };
