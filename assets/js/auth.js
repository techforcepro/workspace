document.addEventListener("DOMContentLoaded", async () => {
  if (window.tfSetupError) { tf.show("Setup required: add your Supabase URL and key in assets/js/config.js.", "error"); return; }
  const loginForm = tf.$("loginForm"), registerForm = tf.$("registerForm"), googleBtn = tf.$("googleBtn");
  try {
    const session = await tf.session();
    if (session) { location.href = "dashboard/index.html"; return; }
  } catch(e) { tf.show(e.message, "error"); }
  if (googleBtn) googleBtn.addEventListener("click", async () => {
    googleBtn.disabled = true;
    const { error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname.replace(/(?:login|register)\.html$/, "dashboard/index.html") } });
    if (error) { tf.show(error.message, "error"); googleBtn.disabled = false; }
  });
  if (loginForm) loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = loginForm.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Signing in…";
    const { error } = await db.auth.signInWithPassword({ email: tf.$("email").value.trim(), password: tf.$("password").value });
    if (error) { tf.show(error.message, "error"); btn.disabled = false; btn.innerHTML = 'Sign in <span>→</span>'; return; }
    location.href = "dashboard/index.html";
  });
  if (registerForm) registerForm.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = registerForm.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Creating account…";
    const name = tf.$("name").value.trim();
    const { data, error } = await db.auth.signUp({
      email: tf.$("email").value.trim(), password: tf.$("password").value,
      options: { data: { full_name: name }, emailRedirectTo: location.origin + location.pathname.replace("register.html", "login.html") }
    });
    if (error) { tf.show(error.message, "error"); btn.disabled = false; btn.innerHTML = 'Create account <span>→</span>'; return; }
    if (data.session) location.href = "dashboard/index.html";
    else tf.show("Account created. Check your email to confirm your address, then sign in. After signing in, request workspace access.", "success");
    btn.disabled = false; btn.innerHTML = 'Create account <span>→</span>';
  });
});