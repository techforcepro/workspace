document.addEventListener("DOMContentLoaded", async () => {
  if (window.tfSetupError) { alert("Configure Supabase in assets/js/config.js first."); return; }
  try {
    const session = await tf.session();
    if (!session) { location.href = "../login.html"; return; }
    const profile = await tf.profile();
    if (!profile || profile.role !== "admin") { location.href = "../dashboard/index.html"; return; }
    await loadAll();
  } catch(e) { tf.show(e.message, "error", "adminMessage"); }
  tf.$("refreshBtn").addEventListener("click", loadAll);
  tf.$("signOut").addEventListener("click", e => { e.preventDefault(); tf.signOut(); });
  const modal = tf.$("grantModal");
  function closeModal(){ modal.hidden = true; }
  tf.$("closeModal").onclick = closeModal; tf.$("cancelGrant").onclick = closeModal;
  tf.$("duration").addEventListener("change", () => { tf.$("customExpiryWrap").hidden = tf.$("duration").value !== "custom"; });
  async function loadAll() {
    tf.$("refreshBtn").disabled = true;
    const [usersRes, reqRes] = await Promise.all([
      db.from("profiles").select("id,email,full_name,role,created_at").order("created_at",{ascending:false}),
      db.from("access_requests").select("id,user_id,status,created_at,profiles(email,full_name)").order("created_at",{ascending:false})
    ]);
    tf.$("refreshBtn").disabled = false;
    if (usersRes.error) throw usersRes.error; if (reqRes.error) throw reqRes.error;
    const users = usersRes.data || [], requests = reqRes.data || [];
    const { data: grants, error: gErr } = await db.from("access_grants").select("user_id,active,expires_at");
    if (gErr) throw gErr;
    const gm = new Map((grants || []).map(g => [g.user_id,g]));
    const activeCount = users.filter(u => { const g=gm.get(u.id); return g && g.active && new Date(g.expires_at)>new Date(); }).length;
    tf.$("totalUsers").textContent = users.length;
    tf.$("activeUsers").textContent = activeCount;
    tf.$("pendingRequests").textContent = requests.filter(r=>r.status==="pending").length;
    const pending = requests.filter(r=>r.status==="pending");
    tf.$("requestsBody").innerHTML = pending.length ? pending.map(r => `<tr><td><b>${tf.escape(r.profiles?.full_name || "User")}</b><small>${tf.escape(r.profiles?.email || "")}</small></td><td>${tf.date(r.created_at)}</td><td><span class="tag tag-pending">PENDING</span></td><td><button class="btn btn-primary btn-small" data-grant="${r.user_id}" data-name="${tf.escape(r.profiles?.email || "User")}">Review / grant</button> <button class="btn btn-danger-ghost btn-small" data-reject="${r.id}">Reject</button></td></tr>`).join("") : '<tr><td colspan="4" class="empty-cell">No pending access requests.</td></tr>';
    tf.$("usersBody").innerHTML = users.map(u => {
      const g=gm.get(u.id), active=!!(g && g.active && new Date(g.expires_at)>new Date());
      return `<tr><td><b>${tf.escape(u.full_name || "User")}</b><small>${tf.escape(u.email)}</small></td><td><span class="tag ${u.role==="admin"?"tag-admin":"tag-neutral"}">${u.role.toUpperCase()}</span></td><td><span class="tag ${active?"tag-active":g?.active?"tag-expired":"tag-neutral"}">${active?"ACTIVE":g?.active?"EXPIRED":g?"REVOKED":"NO ACCESS"}</span></td><td>${g?.expires_at?tf.date(g.expires_at):"—"}</td><td><button class="btn btn-outline btn-small" data-grant="${u.id}" data-name="${tf.escape(u.email)}">Grant / extend</button> ${active?`<button class="btn btn-danger-ghost btn-small" data-revoke="${u.id}">Revoke</button>`:""}</td></tr>`;
    }).join("") || '<tr><td colspan="5" class="empty-cell">No registered users yet.</td></tr>';
    document.querySelectorAll("[data-grant]").forEach(b=>b.addEventListener("click",()=>openGrant(b.dataset.grant,b.dataset.name)));
    document.querySelectorAll("[data-reject]").forEach(b=>b.addEventListener("click",()=>rejectRequest(b.dataset.reject,b)));
    document.querySelectorAll("[data-revoke]").forEach(b=>b.addEventListener("click",()=>revokeAccess(b.dataset.revoke,b)));
  }
  function openGrant(id,email) {
    tf.$("grantUserId").value=id; tf.$("grantUserLabel").textContent="Set access duration for "+email+".";
    tf.$("duration").value="86400"; tf.$("customExpiryWrap").hidden=true; modal.hidden=false;
  }
  tf.$("grantForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const id=tf.$("grantUserId").value, choice=tf.$("duration").value;
    let expiry;
    if(choice==="custom") {
      const raw=tf.$("customExpiry").value;
      if(!raw) return tf.show("Choose a custom expiry date and time.","error","adminMessage");
      expiry=new Date(raw).toISOString();
      if(new Date(expiry)<=new Date()) return tf.show("Expiry must be in the future.","error","adminMessage");
    } else expiry=new Date(Date.now()+Number(choice)*1000).toISOString();
    const btn=tf.$("grantForm").querySelector('[type="submit"]'); btn.disabled=true; btn.textContent="Saving…";
    const {error}=await db.rpc("admin_grant_workspace_access",{p_user_id:id,p_expires_at:expiry});
    btn.disabled=false; btn.textContent="Grant access";
    if(error) return tf.show(error.message,"error","adminMessage");
    closeModal(); tf.show("Workspace access granted successfully.","success","adminMessage"); await loadAll();
  });
  async function revokeAccess(id,btn) {
    if(!confirm("Revoke this user's workspace access immediately?")) return;
    btn.disabled=true;
    const {error}=await db.rpc("admin_revoke_workspace_access",{p_user_id:id});
    if(error) {btn.disabled=false; return tf.show(error.message,"error","adminMessage");}
    tf.show("Access revoked.","success","adminMessage"); await loadAll();
  }
  async function rejectRequest(id,btn) {
    if(!confirm("Reject this access request?")) return;
    btn.disabled=true;
    const {error}=await db.rpc("admin_reject_access_request",{p_request_id:id});
    if(error) {btn.disabled=false; return tf.show(error.message,"error","adminMessage");}
    tf.show("Request rejected.","success","adminMessage"); await loadAll();
  }
});