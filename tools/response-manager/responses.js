
document.addEventListener("DOMContentLoaded", async () => {
  const $ = id => document.getElementById(id);

  let forms = [];
  let responses = [];
  let filtered = [];

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  try {
    if (window.tfSetupError) {
      throw new Error("Configure Supabase in assets/js/config.js.");
    }

    // Check login
    const session = await tf.session();

    if (!session) {
      location.href = "../../login.html";
      return;
    }

    const profile = await tf.profile();

    if (!profile) {
      location.href = "../../login.html";
      return;
    }

    $("userEmail").textContent = profile.email || "Workspace user";

    $("userAvatar").textContent =
      (profile.full_name || profile.email || "U")
        .charAt(0).toUpperCase();

    // Check admin-granted permission
    const {
      data: allowed,
      error: permissionError
    } = await db.rpc("has_response_manager_access");

    if (permissionError) throw permissionError;

    if (allowed !== true) {
      document.querySelector(".app-main").innerHTML = `
        <section class="panel">
          <h2>Access not granted</h2>
          <p class="muted">
            Your administrator has not enabled Response Manager
            for this account. Contact your Workspace administrator.
          </p>
          <a class="btn btn-primary"
             href="../../dashboard/index.html">
            Return to Workspace
          </a>
        </section>
      `;
      return;
    }

    await load();

    $("refreshBtn").addEventListener("click", load);
    $("searchInput").addEventListener("input", applyFilters);
    $("formFilter").addEventListener("change", applyFilters);
    $("exportBtn").addEventListener("click", exportCsv);

    $("signOut").addEventListener("click", async e => {
      e.preventDefault();
      await tf.signOut();
    });

  } catch (error) {
    $("statusMessage").textContent =
      error.message || "Unable to load Response Manager.";

    $("statusMessage").className = "message error";

    $("responseList").innerHTML = `
      <div class="rm-empty rm-error">
        Could not load responses. Check the Contact Forms
        database setup and permissions.
      </div>
    `;
  }

  // Load forms and responses
  async function load() {
    $("refreshBtn").disabled = true;

    $("responseList").innerHTML = `
      <div class="rm-empty">Loading…</div>
    `;

    try {
      const currentProfile = await tf.profile();

      const {
        data: formRows,
        error: formError
      } = await db
        .from("contact_forms")
        .select("id,title,owner_id,created_at,updated_at")
        .eq("owner_id", currentProfile.id)
        .order("updated_at", { ascending: false });

      if (formError) throw formError;

      forms = formRows || [];
      responses = [];

      if (forms.length) {
        const ids = forms.map(f => f.id);

        const {
          data,
          error
        } = await db
          .from("contact_form_submissions")
          .select("id,form_id,answers,submitted_at")
          .in("form_id", ids)
          .order("submitted_at", { ascending: false })
          .limit(1000);

        if (error) throw error;

        responses = data || [];
      }

      // Update statistics
      $("totalResponses").textContent = responses.length;
      $("totalForms").textContent = forms.length;

      const week = Date.now() - 7 * 86400000;

      $("recentResponses").textContent =
        responses.filter(r =>
          new Date(r.submitted_at).getTime() >= week
        ).length;

      // Form filter
      $("formFilter").innerHTML =
        '<option value="">All forms</option>' +
        forms.map(f =>
          `<option value="${esc(f.id)}">${esc(f.title)}</option>`
        ).join("");

      applyFilters();

      $("statusMessage").textContent = "";

    } catch (error) {
      $("statusMessage").textContent =
        error.message || "Unable to load responses.";

      $("statusMessage").className = "message error";

      $("responseList").innerHTML = `
        <div class="rm-empty rm-error">
          ${esc(error.message)}
        </div>
      `;

    } finally {
      $("refreshBtn").disabled = false;
    }
  }

  // Search and filter
  function applyFilters() {
    const q = $("searchInput").value.trim().toLowerCase();
    const formId = $("formFilter").value;

    filtered = responses.filter(r => {
      const f = forms.find(x => x.id === r.form_id);

      const haystack =
        `${f?.title || ""} ${JSON.stringify(r.answers || {})}`
          .toLowerCase();

      return (
        (!formId || r.form_id === formId) &&
        (!q || haystack.includes(q))
      );
    });

    render();
  }

  // Display response cards
  function render() {
    $("resultCount").textContent =
      `${filtered.length} RESULTS`;

    if (!filtered.length) {
      $("responseList").innerHTML = `
        <div class="rm-empty">
          No responses match your search.
          New submissions will appear here.
        </div>
      `;
      return;
    }

    $("responseList").innerHTML = filtered.map((r, i) => {
      const form = forms.find(f => f.id === r.form_id);
      const entries = Object.entries(r.answers || {});

      const preview = entries.slice(0, 2).map(([k, v]) =>
        `${k}: ${Array.isArray(v) ? v.join(", ") : v}`
      ).join(" · ");

      const details = entries.map(([k, v]) => `
        <div class="rm-answer">
          <b>${esc(k)}</b>
          <span>${esc(
            Array.isArray(v)
              ? v.join(", ")
              : (typeof v === "object" && v !== null)
                ? JSON.stringify(v)
                : v
          )}</span>
        </div>
      `).join("");

      return `
        <article class="rm-card">

          <div class="rm-card-head">

            <div>
              <h3>${esc(form?.title || "Contact form")}</h3>

              <div class="rm-meta">
                Submitted ${esc(
                  new Date(r.submitted_at).toLocaleString()
                )}
              </div>
            </div>

            <div class="rm-actions">
              <button
                class="btn btn-outline btn-small"
                data-detail="${i}">
                View details
              </button>
            </div>

          </div>

          <p class="rm-preview">
            ${esc(preview || "No answer preview available")}
          </p>

          <div class="rm-detail" id="detail-${i}" hidden>
            ${details || '<p class="muted">No answers recorded.</p>'}
          </div>

        </article>
      `;
    }).join("");

    document.querySelectorAll("[data-detail]").forEach(btn => {
      btn.addEventListener("click", () => {
        const panel = $(`detail-${btn.dataset.detail}`);

        panel.hidden = !panel.hidden;

        btn.textContent = panel.hidden
          ? "View details"
          : "Hide details";
      });
    });
  }

  // Export filtered responses to CSV
  function exportCsv() {
    const rows = [
      ["Form", "Submitted at", "Answers"]
    ];

    filtered.forEach(r => {
      rows.push([
        forms.find(f => f.id === r.form_id)?.title || "",
        r.submitted_at,
        JSON.stringify(r.answers || {})
      ]);
    });

    const csv = rows.map(row =>
      row.map(v =>
        `"${String(v ?? "").replace(/"/g, '""')}"`
      ).join(",")
    ).join("\r\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "workspace-contact-responses.csv";
    a.click();

    URL.revokeObjectURL(url);
  }

});
