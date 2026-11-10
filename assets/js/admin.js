
document.addEventListener("DOMContentLoaded", async () => {
  const $ = id => document.getElementById(id);

  if (window.tfSetupError) {
    alert("Configure Supabase in assets/js/config.js first.");
    return;
  }

  let users = [];
  let requests = [];
  let workspaceGrants = [];
  let responseGrants = [];

  const workspaceModal = $("grantModal");
  const responseModal = $("responseGrantModal");

  try {
    const session = await tf.session();

    if (!session) {
      location.href = "../login.html";
      return;
    }

    const profile = await tf.profile();

    if (!profile || profile.role !== "admin") {
      location.href = "../dashboard/index.html";
      return;
    }

    await loadAll();

  } catch (error) {
    tf.show(error.message || "Unable to load admin panel.", "error", "adminMessage");
    return;
  }

  // Main controls
  $("refreshBtn").addEventListener("click", loadAll);

  $("signOut").addEventListener("click", event => {
    event.preventDefault();
    tf.signOut();
  });

  // Workspace modal controls
  function closeWorkspaceModal() {
    workspaceModal.hidden = true;
  }

  $("closeModal").addEventListener("click", closeWorkspaceModal);
  $("cancelGrant").addEventListener("click", closeWorkspaceModal);

  $("duration").addEventListener("change", () => {
    $("customExpiryWrap").hidden =
      $("duration").value !== "custom";
  });

  // Response Manager modal controls
  function closeResponseModal() {
    responseModal.hidden = true;
  }

  $("closeResponseModal").addEventListener("click", closeResponseModal);
  $("cancelResponseGrant").addEventListener("click", closeResponseModal);

  $("responseDuration").addEventListener("change", () => {
    $("responseCustomExpiryWrap").hidden =
      $("responseDuration").value !== "custom";
  });

  // Load all admin data
  async function loadAll() {
    $("refreshBtn").disabled = true;

    $("requestsBody").innerHTML =
      '<tr><td colspan="4" class="empty-cell">Loading requests…</td></tr>';

    $("usersBody").innerHTML =
      '<tr><td colspan="6" class="empty-cell">Loading users…</td></tr>';

    try {
      const [usersRes, requestsRes, workspaceRes, responseRes] =
        await Promise.all([

          db.from("profiles")
            .select("id,email,full_name,role,created_at")
            .order("created_at", { ascending: false }),

          // Do not embed profiles here.
          // This avoids the ambiguous relationship error.
          db.from("access_requests")
            .select("id,user_id,status,created_at")
            .order("created_at", { ascending: false }),

          db.from("access_grants")
            .select("user_id,active,expires_at"),

          db.from("response_manager_access")
            .select("user_id,active,expires_at")

        ]);

      if (usersRes.error) throw usersRes.error;
      if (requestsRes.error) throw requestsRes.error;
      if (workspaceRes.error) throw workspaceRes.error;
      if (responseRes.error) throw responseRes.error;

      users = usersRes.data || [];
      requests = requestsRes.data || [];
      workspaceGrants = workspaceRes.data || [];
      responseGrants = responseRes.data || [];

      renderStatistics();
      renderRequests();
      renderUsers();

    } catch (error) {
      tf.show(
        error.message || "Unable to load admin information.",
        "error",
        "adminMessage"
      );

      $("requestsBody").innerHTML =
        `<tr><td colspan="4" class="empty-cell">${tf.escape(error.message)}</td></tr>`;

      $("usersBody").innerHTML =
        `<tr><td colspan="6" class="empty-cell">${tf.escape(error.message)}</td></tr>`;

    } finally {
      $("refreshBtn").disabled = false;
    }
  }

  // Find a user's access record
  function findGrant(records, userId) {
    return records.find(record => record.user_id === userId);
  }

  // Check whether a permission is currently active
  function isActive(grant) {
    return !!(
      grant &&
      grant.active &&
      grant.expires_at &&
      new Date(grant.expires_at).getTime() > Date.now()
    );
  }

  // Format permission status
  function statusInfo(grant) {
    if (!grant) {
      return {
        label: "NO ACCESS",
        className: "permission-none"
      };
    }

    if (isActive(grant)) {
      return {
        label: "ACTIVE",
        className: "permission-active"
      };
    }

    if (grant.active) {
      return {
        label: "EXPIRED",
        className: "permission-expired"
      };
    }

    return {
      label: "REVOKED",
      className: "permission-revoked"
    };
  }

  // Statistics
  function renderStatistics() {
    const activeCount = users.filter(user =>
      isActive(findGrant(workspaceGrants, user.id))
    ).length;

    $("totalUsers").textContent = users.length;
    $("activeUsers").textContent = activeCount;

    $("pendingRequests").textContent =
      requests.filter(request => request.status === "pending").length;
  }

  // Access requests
  function renderRequests() {
    const pending = requests.filter(
      request => request.status === "pending"
    );

    const userMap = new Map(
      users.map(user => [user.id, user])
    );

    if (!pending.length) {
      $("requestsBody").innerHTML =
        '<tr><td colspan="4" class="empty-cell">No pending access requests.</td></tr>';
      return;
    }

    $("requestsBody").innerHTML = pending.map(request => {
      const user = userMap.get(request.user_id) || {};

      return `
        <tr>
          <td>
            <b>${tf.escape(user.full_name || "User")}</b>
            <small>${tf.escape(user.email || "")}</small>
          </td>

          <td>${tf.date(request.created_at)}</td>

          <td>
            <span class="tag tag-pending">PENDING</span>
          </td>

          <td>
            <button
              class="btn btn-primary btn-small"
              data-grant="${tf.escape(request.user_id)}"
              data-name="${tf.escape(user.email || "User")}">
              Review / grant
            </button>

            <button
              class="btn btn-danger-ghost btn-small"
              data-reject="${tf.escape(request.id)}">
              Reject
            </button>
          </td>
        </tr>
      `;
    }).join("");

    document.querySelectorAll("[data-grant]").forEach(button => {
      button.addEventListener("click", () => {
        openWorkspaceGrant(
          button.dataset.grant,
          button.dataset.name
        );
      });
    });

    document.querySelectorAll("[data-reject]").forEach(button => {
      button.addEventListener("click", () => {
        rejectRequest(button.dataset.reject, button);
      });
    });
  }

  // Users table
  function renderUsers() {
    if (!users.length) {
      $("usersBody").innerHTML =
        '<tr><td colspan="6" class="empty-cell">No registered users yet.</td></tr>';
      return;
    }

    $("usersBody").innerHTML = users.map(user => {
      const workspaceGrant = findGrant(workspaceGrants, user.id);
      const responseGrant = findGrant(responseGrants, user.id);

      const workspaceActive = isActive(workspaceGrant);
      const responseActive = isActive(responseGrant);

      const workspaceStatus = statusInfo(workspaceGrant);
      const responseStatus = statusInfo(responseGrant);

      return `
        <tr>

          <td>
            <b>${tf.escape(user.full_name || "User")}</b>
            <small>${tf.escape(user.email || "")}</small>
          </td>

          <td>
            <span class="tag ${
              user.role === "admin" ? "tag-admin" : "tag-neutral"
            }">
              ${tf.escape((user.role || "user").toUpperCase())}
            </span>
          </td>

          <td>
            <span class="permission-badge ${workspaceStatus.className}">
              ${workspaceStatus.label}
            </span>
          </td>

          <td>
            ${workspaceGrant?.expires_at
              ? tf.date(workspaceGrant.expires_at)
              : "—"}
          </td>

          <td>
            <div class="permission-actions">

              <button
                class="btn btn-outline btn-small"
                data-workspace-grant="${tf.escape(user.id)}"
                data-name="${tf.escape(user.email || "User")}">
                Grant / extend
              </button>

              ${workspaceActive ? `
                <button
                  class="btn btn-danger-ghost btn-small"
                  data-workspace-revoke="${tf.escape(user.id)}">
                  Revoke
                </button>
              ` : ""}

            </div>
          </td>

          <td>

            <span class="permission-badge ${responseStatus.className}">
              ${responseStatus.label}
            </span>

            <div class="permission-info">
              ${responseGrant?.expires_at
                ? "Expires: " + tf.escape(
                    new Date(responseGrant.expires_at).toLocaleString()
                  )
                : "No expiry recorded"}
            </div>

            <div class="permission-actions" style="margin-top:9px">

              <button
                class="btn btn-outline btn-small"
                data-response-grant="${tf.escape(user.id)}"
                data-name="${tf.escape(user.email || "User")}">
                Grant / extend
              </button>

              ${responseActive ? `
                <button
                  class="btn btn-danger-ghost btn-small"
                  data-response-revoke="${tf.escape(user.id)}">
                  Revoke
                </button>
              ` : ""}

            </div>

          </td>

        </tr>
      `;
    }).join("");

    // Workspace grant buttons
    document.querySelectorAll("[data-workspace-grant]").forEach(button => {
      button.addEventListener("click", () => {
        openWorkspaceGrant(
          button.dataset.workspaceGrant,
          button.dataset.name
        );
      });
    });

    // Workspace revoke buttons
    document.querySelectorAll("[data-workspace-revoke]").forEach(button => {
      button.addEventListener("click", () => {
        revokeWorkspaceAccess(button.dataset.workspaceRevoke, button);
      });
    });

    // Response Manager grant buttons
    document.querySelectorAll("[data-response-grant]").forEach(button => {
      button.addEventListener("click", () => {
        openResponseGrant(
          button.dataset.responseGrant,
          button.dataset.name
        );
      });
    });

    // Response Manager revoke buttons
    document.querySelectorAll("[data-response-revoke]").forEach(button => {
      button.addEventListener("click", () => {
        revokeResponseAccess(button.dataset.responseRevoke, button);
      });
    });
  }

  // Workspace grant modal
  function openWorkspaceGrant(id, email) {
    $("grantUserId").value = id;
    $("grantUserLabel").textContent =
      "Set Workspace access duration for " + email + ".";

    $("duration").value = "86400";
    $("customExpiry").value = "";
    $("customExpiryWrap").hidden = true;

    workspaceModal.hidden = false;
  }

  // Workspace grant submit
  $("grantForm").addEventListener("submit", async event => {
    event.preventDefault();

    const id = $("grantUserId").value;
    const choice = $("duration").value;

    let expiry;

    if (choice === "custom") {
      const raw = $("customExpiry").value;

      if (!raw) {
        return tf.show(
          "Choose a custom expiry date and time.",
          "error",
          "adminMessage"
        );
      }

      expiry = new Date(raw).toISOString();

      if (new Date(expiry) <= new Date()) {
        return tf.show(
          "Expiry must be in the future.",
          "error",
          "adminMessage"
        );
      }

    } else {
      expiry = new Date(
        Date.now() + Number(choice) * 1000
      ).toISOString();
    }

    const button = $("grantForm").querySelector('[type="submit"]');

    button.disabled = true;
    button.textContent = "Saving…";

    try {
      const { error } = await db.rpc(
        "admin_grant_workspace_access",
        {
          p_user_id: id,
          p_expires_at: expiry
        }
      );

      if (error) throw error;

      workspaceModal.hidden = true;

      tf.show(
        "Workspace access granted successfully.",
        "success",
        "adminMessage"
      );

      await loadAll();

    } catch (error) {
      tf.show(error.message, "error", "adminMessage");

    } finally {
      button.disabled = false;
      button.textContent = "Grant access";
    }
  });

  // Workspace revoke
  async function revokeWorkspaceAccess(id, button) {
    if (!confirm("Revoke this user's Workspace access immediately?")) {
      return;
    }

    button.disabled = true;

    try {
      const { error } = await db.rpc(
        "admin_revoke_workspace_access",
        {
          p_user_id: id
        }
      );

      if (error) throw error;

      tf.show(
        "Workspace access revoked.",
        "success",
        "adminMessage"
      );

      await loadAll();

    } catch (error) {
      button.disabled = false;
      tf.show(error.message, "error", "adminMessage");
    }
  }

  // Response Manager grant modal
  function openResponseGrant(id, email) {
    $("responseGrantUserId").value = id;

    $("responseGrantUserLabel").textContent =
      "Grant Response Manager access to " + email + ".";

    $("responseDuration").value = "2592000";
    $("responseCustomExpiry").value = "";
    $("responseCustomExpiryWrap").hidden = true;

    responseModal.hidden = false;
  }

  // Response Manager grant submit
  $("responseGrantForm").addEventListener("submit", async event => {
    event.preventDefault();

    const id = $("responseGrantUserId").value;
    const choice = $("responseDuration").value;

    let expiry;

    if (choice === "custom") {
      const raw = $("responseCustomExpiry").value;

      if (!raw) {
        return tf.show(
          "Choose a custom permission expiry.",
          "error",
          "adminMessage"
        );
      }

      expiry = new Date(raw).toISOString();

      if (new Date(expiry) <= new Date()) {
        return tf.show(
          "Expiry must be in the future.",
          "error",
          "adminMessage"
        );
      }

    } else {
      expiry = new Date(
        Date.now() + Number(choice) * 1000
      ).toISOString();
    }

    const button =
      $("responseGrantForm").querySelector('[type="submit"]');

    button.disabled = true;
    button.textContent = "Saving…";

    try {
      const { error } = await db.rpc(
        "admin_grant_response_manager_access",
        {
          p_user_id: id,
          p_expires_at: expiry
        }
      );

      if (error) throw error;

      responseModal.hidden = true;

      tf.show(
        "Response Manager permission granted successfully.",
        "success",
        "adminMessage"
      );

      await loadAll();

    } catch (error) {
      tf.show(error.message, "error", "adminMessage");

    } finally {
      button.disabled = false;
      button.textContent = "Grant permission";
    }
  });

  // Response Manager revoke
  async function revokeResponseAccess(id, button) {
    if (!confirm(
      "Revoke this user's Response Manager permission immediately?"
    )) {
      return;
    }

    button.disabled = true;

    try {
      const { error } = await db.rpc(
        "admin_revoke_response_manager_access",
        {
          p_user_id: id
        }
      );

      if (error) throw error;

      tf.show(
        "Response Manager permission revoked.",
        "success",
        "adminMessage"
      );

      await loadAll();

    } catch (error) {
      button.disabled = false;
      tf.show(error.message, "error", "adminMessage");
    }
  }

  // Reject access request
  async function rejectRequest(id, button) {
    if (!confirm("Reject this access request?")) {
      return;
    }

    button.disabled = true;

    try {
      const { error } = await db.rpc(
        "admin_reject_access_request",
        {
          p_request_id: id
        }
      );

      if (error) throw error;

      tf.show(
        "Access request rejected.",
        "success",
        "adminMessage"
      );

      await loadAll();

    } catch (error) {
      button.disabled = false;
      tf.show(error.message, "error", "adminMessage");
    }
  }

});
