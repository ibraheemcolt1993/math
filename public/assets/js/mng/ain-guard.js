(function () {
  const statusBadge = document.getElementById('ainStatusBadge');
  const userLabel = document.getElementById('ainUserLabel');
  const logoutBtn = document.getElementById('ainLogoutBtn');

  function getNextPath() {
    const path = window.location.pathname + window.location.search + window.location.hash;
    return encodeURIComponent(path);
  }

  function redirectToLogin() {
    const next = getNextPath();
    window.location.replace(`/ain/lin.html?next=${next}`);
  }

  function updateUserUI(user) {
    if (statusBadge) {
      statusBadge.textContent = user?.username
        ? `محمي · ${user.username}`
        : 'محمي';
    }
    if (userLabel) {
      userLabel.textContent = user?.username
        ? `مرحبًا، ${user.username}`
        : 'محمي';
    }
  }

  async function loadSession() {
    try {
      const res = await fetch('/api/ain/me', {
        credentials: 'include',
        cache: 'no-store'
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        redirectToLogin();
        return;
      }

      updateUserUI(data?.user || null);
    } catch (error) {
      redirectToLogin();
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/ain/out', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (error) {
        console.error('Logout failed', error);
      } finally {
        window.location.replace('/ain/lin.html');
      }
    });
  }

  loadSession();
})();
