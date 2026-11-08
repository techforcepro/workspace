
document.addEventListener("DOMContentLoaded", async () => {
  if (window.tfSetupError) {
    alert("Configure Supabase in assets/js/config.js first.");
    return;
  }

  const $ = (id) => tf.$(id);

  const refreshBtn = $("refreshBtn");
  const modal = $("grantModal");
  const grantForm = $("grantForm");

  let loading = false;

  try {
    // Check authentication
    const session = await tf.session();

    if (!session) {
      location.href = "../login.html";
      return;
    }

    // Check admin role
    const profile = await tf.profile();

    if (!profile || profile.role !== "admin") {
      location.href = "../dashboard/index.html";
      return;
    }

    // Load dashboard
    await loadAll();

  } catch (error) {
    console.error("Admin initialization error:", error);
    tf.show(
      error.message || "Unable to initialize admin dashboard.",
      "error",
      "adminMessage"
    );
  }

  // Refresh button
  refreshBtn.addEventListener("click", loadAll);

  // Sign out
  $("signOut").addEventListener("click", async (e) => {
    e.preventDefault();
    await tf.signOut();
  });

  // Modal controls
  function closeModal() {
    modal.hidden = true;
    grantForm.reset();
    $("customExpiryWrap").hidden = true;
  }

  $("closeModal").addEventListener("click", closeModal);
  $("cancelGrant").addEventListener("click", closeModal);

  $("duration").addEventListener("change", () => {
    $("customExpiryWrap").hidden =
      $("duration").value !== "custom";
  });

  // ----------------------------------
  // LOAD ADMIN DASHBOARD
  // ----------------------------------

  async function loadAll() {
    if (loading) return;

    loading = true;
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Loading...";

    try {
      // Fetch users and access requests separately.
      // This avoids ambiguous Supabase relationships.
      const [usersRes, reqRes, grantsRes] = await Promise.all([
        db
          .from("profiles")
          .select("id,email,full_name,role,created_at")
          .order("created_at", { ascending: false }),

        db
          .from("access_requests")
          .select("id,user_id,status,created_at")
          .order("created_at", { ascending: false }),

        db
          .from("access_grants")
          .select("user_id,active,expires_at")
      ]);

      if (usersRes.error) throw usersRes.error;
      if (reqRes.error) throw reqRes.error;
      if (grantsRes.error) throw grantsRes.error;

      const users = usersRes.data || [];
      const requests = reqRes.data || [];
      const grants = grantsRes.data || [];

      // Map users by ID
      const userMap = new Map(
        users.map(user => [user.id, user])
      );

      // Map grants by user ID
      const grantMap = new Map(
        grants.map(grant => [grant.user_id, grant])
      );

      // Check active access
      const now = Date.now();

      function isActive(grant) {
        return !!(
          grant &&
          grant.active &&
          grant.expires_at &&
          new Date(grant.expires_at).getTime() > now
        );
      }

      // Statistics
      const activeCount = users.filter(user =>
        isActive(grantMap.get(user.id))
      ).length;

      const pendingRequests = requests.filter(
        request => request.status === "pending"
      );

      $("totalUsers").textContent = users.length;
      $("activeUsers").textContent = activeCount;
      $("pendingRequests").textContent = pendingRequests.length;

      // ----------------------------------
      // PENDING ACCESS REQUESTS
      // ----------------------------------

      $("requestsBody").innerHTML = pendingRequests.length
        ? pendingRequests.map(request => {
            const user = userMap.get(request.user_id);

            const name = user?.full_name || "User";
            const email = user?.email || "Unknown email";

            return `
              <tr>
                <td>
                  <b>${tf.escape(name)}</b>
                  <small>${tf.escape(email)}</small>
                </td>

                <td>${tf.date(request.created_at)}</td>

                <td>
                  <span class="tag tag-pending">
                    PENDING
                  </span>
                </td>

                <td>
                  <button
                    class="btn btn-primary btn-small"
                    data-grant="${tf.escape(request.user_id)}"
                    data-name="${tf.escape(email)}"
                  >
                    Review / grant
                  </button>

                  <button
                    class="btn btn-danger-ghost btn-small"
                    data-reject="${tf.escape(request.id)}"
                  >
                    Reject
                  </button>
                </td>
              </tr>
            `;
          }).join("")
        : `
          <tr>
            <td colspan="4" class="empty-cell">
              No pending access requests.
            </td>
          </tr>
        `;

      // ----------------------------------
      // ALL REGISTERED USERS
      // ----------------------------------

      $("usersBody").innerHTML = users.length
        ? users.map(user => {
            const grant = grantMap.get(user.id);
            const active = isActive(grant);

            let accessStatus = "NO ACCESS";
            let statusClass = "tag-neutral";

            if (active) {
              accessStatus = "ACTIVE";
              statusClass = "tag-active";
            } else if (grant?.active) {
              accessStatus = "EXPIRED";
              statusClass = "tag-expired";
            } else if (grant) {
              accessStatus = "REVOKED";
              statusClass = "tag-neutral";
            }

            const role = user.role || "user";

            return `
              <tr>
                <td>
                  <b>${tf.escape(user.full_name || "User")}</b>
                  <small>${tf.escape(user.email || "")}</small>
                </td>

                <td>
                  <span class="tag ${
                    role === "admin"
                      ? "tag-admin"
                      : "tag-neutral"
                  }">
                    ${tf.escape(role.toUpperCase())}
                  </span>
                </td>

                <td>
                  <span class="tag ${statusClass}">
                    ${accessStatus}
                  </span>
                </td>

                <td>
                  ${
                    grant?.expires_at
                      ? tf.date(grant.expires_at)
                      : "—"
                  }
                </td>

                <td>
                  <button
                    class="btn btn-outline btn-small"
                    data-grant="${tf.escape(user.id)}"
                    data-name="${tf.escape(user.email || "User")}"
                  >
                    Grant / extend
                  </button>

                  ${
                    active
                      ? `
                        <button
                          class="btn btn-danger-ghost btn-small"
                          data-revoke="${tf.escape(user.id)}"
                        >
                          Revoke
                        </button>
                      `
                      : ""
                  }
                </td>
              </tr>
            `;
          }).join("")
        : `
          <tr>
            <td colspan="5" class="empty-cell">
              No registered users yet.
            </td>
          </tr>
        `;

      // ----------------------------------
      // BUTTON EVENT HANDLERS
      // ----------------------------------

      document.querySelectorAll("[data-grant]").forEach(button => {
        button.addEventListener("click", () => {
          openGrant(
            button.dataset.grant,
            button.dataset.name
          );
        });
      });

      document.querySelectorAll("[data-reject]").forEach(button => {
        button.addEventListener("click", () => {
          rejectRequest(
            button.dataset.reject,
            button
          );
        });
      });

      document.querySelectorAll("[data-revoke]").forEach(button => {
        button.addEventListener("click", () => {
          revokeAccess(
            button.dataset.revoke,
            button
          );
        });
      });

    } catch (error) {
      console.error("Dashboard loading error:", error);

      tf.show(
        error.message || "Failed to load admin dashboard.",
        "error",
        "adminMessage"
      );

    } finally {
      loading = false;
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh";
    }
  }

  // ----------------------------------
  // OPEN GRANT ACCESS MODAL
  // ----------------------------------

  function openGrant(userId, email) {
    $("grantUserId").value = userId;

    $("grantUserLabel").textContent =
      "Set access duration for " + email + ".";

    $("duration").value = "86400";

    $("customExpiryWrap").hidden = true;

    $("customExpiry").value = "";

    modal.hidden = false;
  }

  // ----------------------------------
  // GRANT / EXTEND ACCESS
  // ----------------------------------

  grantForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const userId = $("grantUserId").value;
    const choice = $("duration").value;

    if (!userId) {
      return tf.show(
        "Please select a user.",
        "error",
        "adminMessage"
      );
    }

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

      const customDate = new Date(raw);

      if (Number.isNaN(customDate.getTime())) {
        return tf.show(
          "Invalid expiry date.",
          "error",
          "adminMessage"
        );
      }

      if (customDate.getTime() <= Date.now()) {
        return tf.show(
          "Expiry must be in the future.",
          "error",
          "adminMessage"
        );
      }

      expiry = customDate.toISOString();

    } else {
      const seconds = Number(choice);

      if (!Number.isFinite(seconds) || seconds <= 0) {
        return tf.show(
          "Invalid access duration.",
          "error",
          "adminMessage"
        );
      }

      expiry = new Date(
        Date.now() + seconds * 1000
      ).toISOString();
    }

    const button = grantForm.querySelector(
      '[type="submit"]'
    );

    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const { error } = await db.rpc(
        "admin_grant_workspace_access",
        {
          p_user_id: userId,
          p_expires_at: expiry
        }
      );

      if (error) throw error;

      closeModal();

      tf.show(
        "Workspace access granted successfully.",
        "success",
        "adminMessage"
      );

      await loadAll();

    } catch (error) {
      console.error("Grant access error:", error);

      tf.show(
        error.message || "Unable to grant access.",
        "error",
        "adminMessage"
      );

    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  // ----------------------------------
  // REVOKE USER ACCESS
  // ----------------------------------

  async function revokeAccess(userId, button) {
    if (!confirm(
      "Revoke this user's workspace access immediately?"
    )) {
      return;
    }

    button.disabled = true;

    try {
      const { error } = await db.rpc(
        "admin_revoke_workspace_access",
        {
          p_user_id: userId
        }
      );

      if (error) throw error;

      tf.show(
        "Access revoked successfully.",
        "success",
        "adminMessage"
      );

      await loadAll();

    } catch (error) {
      console.error("Revoke access error:", error);

      button.disabled = false;

      tf.show(
        error.message || "Unable to revoke access.",
        "error",
        "adminMessage"
      );
    }
  }

  // ----------------------------------
  // REJECT ACCESS REQUEST
  // ----------------------------------

  async function rejectRequest(requestId, button) {
    if (!confirm("Reject this access request?")) {
      return;
    }

    button.disabled = true;

    try {
      const { error } = await db.rpc(
        "admin_reject_access_request",
        {
          p_request_id: requestId
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
      console.error("Reject request error:", error);

      button.disabled = false;

      tf.show(
        error.message || "Unable to reject request.",
        "error",
        "adminMessage"
      );
    }
  }
});
