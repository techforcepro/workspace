(() => {
  const cfg = window.TF_CONFIG || {};
  const valid = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");
  if (!window.supabase || !valid) {
    console.error("Configure assets/js/config.js with your Supabase URL and publishable/anon key.");
    window.tfSetupError = true;
  } else {
    window.db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  window.tf = {
    $(id) { return document.getElementById(id); },
    show(message, type="info", target="message") {
      const el = document.getElementById(target);
      if (!el) return;
      el.textContent = message; el.className = "message " + type;
    },
    async session() {
      if (!window.db) throw new Error("Supabase is not configured. Edit assets/js/config.js first.");
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async profile() {
      const { data: { user }, error } = await db.auth.getUser();
      if (error || !user) return null;
      const { data, error: pErr } = await db.from("profiles").select("id,email,full_name,role").eq("id", user.id).single();
      if (pErr) throw pErr;
      return { ...data, authUser: user };
    },
    async signOut() { await db.auth.signOut(); location.href = "../login.html"; },
    date(value) {
      if (!value) return "—";
      return new Date(value).toLocaleString([], {dateStyle:"medium", timeStyle:"short"});
    },
    escape(value) {
      return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    }
  };
})();