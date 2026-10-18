const PKG_URL = "https://debmaker-cpp.github.io/dists/termux/main/binary-aarch64/Packages";
const CACHE = "debmaker:pkgs:v1";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小时
let data = [];

function parse(text) {
  return text.split(/\n\s*\n/).map(b => {
    const o = {};
    let lastKey = "";
    b.split("\n").forEach(l => {
      // 处理多行字段（以空格开头的续行）
      if (l.startsWith(" ") && lastKey) {
        o[lastKey] += " " + l.trim();
        return;
      }
      const i = l.indexOf(":");
      if (i < 0) return;
      const k = l.slice(0, i).trim().toLowerCase();
      o[k] = l.slice(i + 1).trim();
      lastKey = k;
    });
    return o;
  }).filter(o => o.package);
}

function esc(s) {
  return (s || "").replace(/[&<>]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
}

function shortHash(h) {
  if (!h) return "";
  return h.length > 16 ? h.slice(0, 12) + "…" : h;
}

function render() {
  const el = document.getElementById("list");
  if (!data.length) {
    el.innerHTML = '<div class="empty">暂无包数据</div>';
    return;
  }
  el.innerHTML = data.map(o => {
    const hash = o.sha256 || o.sha1 || o.md5sum || "";
    const hashTag = hash
      ? `<span class="tag" title="${esc(hash)}" onclick="navigator.clipboard.writeText('${esc(hash)}');this.style.background='#1a7f37';this.style.color='#fff';setTimeout(()=>{this.style.background='';this.style.color='';},1200)">🔑 ${shortHash(hash)}</span>`
      : "";
    return `
<div class="pkg">
<span class="v">${esc(o.version)} · ${esc(o.architecture)}</span>
<h3>${esc(o.package)}</h3>
<p>${esc(o.description) || '<span style="color:#aaa">无描述</span>'}</p>
<div class="tags">
${o.section ? `<span class="tag">${esc(o.section)}</span>` : ""}
${o.maintainer ? `<span class="tag">${esc(o.maintainer.replace(/[<>]/g, ""))}</span>` : ""}
${o.size ? `<span class="tag">${Math.round(o.size / 1024)} KB</span>` : ""}
${hashTag}
</div>
</div>`;
  }).join("");
  document.getElementById("n").textContent = `共 ${data.length} 个包`;
}

// 显示缓存状态
function showCacheStatus(cached) {
  const el = document.getElementById("n");
  if (cached) {
    const t = new Date(cached).toLocaleTimeString("zh-CN");
    el.textContent = `共 ${data.length} 个包 · 缓存于 ${t}（24h 后自动刷新）`;
  } else {
    el.textContent = `共 ${data.length} 个包 · 刚获取`;
  }
}

(async () => {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || "null") || {};
    const now = Date.now();

    if (c.t && now - c.t < CACHE_TTL) {
      // 缓存有效，用缓存
      data = c.d;
      render();
      showCacheStatus(c.t);
    } else {
      // 缓存过期或不存在，重新拉
      const r = await fetch(PKG_URL, { cache: "no-store" });
      if (!r.ok) throw new Error("Packages 返回 " + r.status);
      data = parse(await r.text());
      localStorage.setItem(CACHE, JSON.stringify({ t: now, d: data }));
      render();
      showCacheStatus(now);
    }

    // 后台静默刷新：如果缓存超过 1 小时但不到 24 小时，
    // 仍然在后台拉一次更新缓存（下次打开用新数据）
    if (c.t && now - c.t >= 60 * 60 * 1000 && now - c.t < CACHE_TTL) {
      fetch(PKG_URL, { cache: "no-store" }).then(r => {
        if (r.ok) return r.text();
      }).then(text => {
        if (text) {
          const fresh = parse(text);
          if (fresh.length) {
            localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), d: fresh }));
          }
        }
      }).catch(() => {}); // 静默失败
    }
  } catch (e) {
    console.error(e);
    document.getElementById("err").innerHTML =
      `<div class="err"><b>包列表抓取失败：</b>${e.message}<br>
可能是 GitHub Pages 未开 CORS，或仓库结构已变更。</div>`;
    document.getElementById("list").innerHTML = '<div class="empty">暂无包数据</div>';
  }
})();

