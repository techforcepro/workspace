document.addEventListener("DOMContentLoaded", async () => {
  if (window.tfSetupError) { alert("Configure Supabase in assets/js/config.js first."); return; }
  try {
    const session = await tf.session();
    if (!session) { location.href = "../login.html"; return; }
    const profile = await tf.profile();
    if (!profile) { location.href = "../login.html"; return; }
    tf.$("userEmail").textContent = profile.email;
    tf.$("avatar").textContent = (profile.full_name || profile.email || "U").charAt(0).toUpperCase();
    tf.$("welcomeTitle").textContent = "Welcome, " + (profile.full_name || "there");
    tf.$("roleTag").textContent = profile.role.toUpperCase();
    if (profile.role === "admin") {
      const link = document.createElement("a"); link.className = "btn btn-outline btn-small"; link.href = "../admin/index.html"; link.textContent = "Admin console";
      document.querySelector(".app-header").appendChild(link);
    }
    await refreshAccess();
  } catch (e) { console.error(e); tf.show(e.message, "error", "accessDescription"); }
  async function refreshAccess() {
    const { data, error } = await db.rpc("get_my_workspace_access");
    if (error) throw error;
    const a = data && data[0] ? data[0] : { status:"not_requested", expires_at:null };
    const status = a.status;
    tf.$("accessStatus").textContent = status.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
    tf.$("accessBadge").textContent = status.replaceAll("_"," ").toUpperCase();
    tf.$("expiryValue").textContent = a.expires_at ? tf.date(a.expires_at) : "—";
    tf.$("expirySub").textContent = a.expires_at && status === "active" ? "Permission end date" : "No active permission";
    tf.$("accessSub").textContent = status === "active" ? "You can use the workspace" : "Workspace is currently locked";
    const desc = {
      active:"Your access is active. You can use the enabled workspace features until the expiry time shown above.",
      pending:"Your request has been submitted and is waiting for administrator review.",
      expired:"Your previous access has expired. Submit a new request to ask the administrator for more time.",
      revoked:"Your workspace access was revoked by an administrator. You can submit a new request.",
      rejected:"Your latest access request was declined. You may submit another request if needed.",
      not_requested:"You have an account, but workspace access has not been requested yet. Submit a request to get started."
    };
    tf.$("accessDescription").textContent = desc[status] || "Your workspace access is not active.";
    const actions = tf.$("accessActions"); actions.innerHTML = "";
    if (status === "active") {
      const note = document.createElement("span"); note.className = "tag tag-active"; note.textContent = "Workspace unlocked"; actions.append(note);
    } else if (status === "pending") {
      const note = document.createElement("span"); note.className = "tag tag-pending"; note.textContent = "Awaiting admin approval"; actions.append(note);
    } else {
      const btn = document.createElement("button"); btn.className = "btn btn-primary"; btn.textContent = "Request workspace access";
      btn.addEventListener("click", async () => {
        btn.disabled = true; btn.textContent = "Submitting…";
        const { error } = await db.rpc("request_workspace_access");
        if (error) { tf.show(error.message, "error", "accessDescription"); btn.disabled = false; btn.textContent = "Request workspace access"; return; }
        await refreshAccess();
      });
      actions.append(btn);
    }
  }
  tf.$("signOut").addEventListener("click", e => { e.preventDefault(); tf.signOut(); });
  tf.$("projectsLink").addEventListener("click", e => { e.preventDefault(); alert("Projects and CodeSpace are planned for V2."); });
  tf.$("accessLink").addEventListener("click", e => { e.preventDefault(); document.querySelector(".access-panel").scrollIntoView({behavior:"smooth"}); });
});