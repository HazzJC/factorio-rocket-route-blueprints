// builds the single-file tool: node build.js [out.html]   (optional first: python make_belts.py, python make_assets.py <font dir>; see the README)
const fs = require('fs'), path = require('path');
const dir = __dirname, rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const have = (f) => fs.existsSync(path.join(dir, f));
// generated files (game artwork, fonts) are optional: without them the tool still works, with flat placeholders
const opt = (f, stub) => have(f) ? rd(f) : (console.warn('missing ' + f + ': building without it (see README, "Game artwork")'), stub);
const STUB_ASSETS = "const ASSETS = {icons:{},sprites:{},imgs:{},floors:{'refined-concrete':{s:64,d:''},'se-space-platform-scaffold':{s:64,d:''}},Z:20};\n";
const STUB_BELTS = 'const BELTS = {cell:48,frames:8,tile:32,off:8,atlas:{}};\n';
const style = rd('style.css').replace('/*__FONTS__*/', () => opt('fonts.css', ''));
const dest = process.argv[2] || path.join(dir, '..', 'dist', 'rocket-route-blueprints.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
const html = rd('tool.src.html').replace('/*__STYLE__*/', () => style).replace('/*__ASSETS__*/', () => opt('assets.js', STUB_ASSETS)).replace('/*__BELTS__*/', () => opt('belts.js', STUB_BELTS)).replace('/*__BPGEN__*/', () => rd('bpgen.js'));
fs.writeFileSync(dest, html); console.log('wrote', dest, Math.round(html.length / 1024) + ' KB');
