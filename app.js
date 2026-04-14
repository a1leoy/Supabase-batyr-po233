import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://gdnajqgqlxzuburfzgtr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_w_0fS1tnQZ1hgB8pML0rog_Mx_Ev9Yd";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

const googleLoginBtn = document.getElementById("googleLoginBtn");
const authSection = document.getElementById("authSection");
const appSection = document.getElementById("appSection");

const profileAvatar = document.getElementById("profileAvatar");
const profileName = document.getElementById("profileName");
const profileEmail = document.getElementById("profileEmail");

const usersList = document.getElementById("usersList");
const statusButtons = document.getElementById("statusButtons");
const logoutBtn = document.getElementById("logoutBtn");
const messageBox = document.getElementById("message");

const STATUSES = ["учусь", "кофе", "в игре", "дома"];

let currentUser = null;
let channel = null;

function showMessage(text, type = "success") {
  if (!messageBox) return;
  messageBox.textContent = text;
  messageBox.className = `message ${type}`;
  messageBox.classList.remove("hidden");
}

function clearMessage() {
  if (!messageBox) return;
  messageBox.textContent = "";
  messageBox.className = "message hidden";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fallbackAvatar(name = "U") {
  const first = encodeURIComponent((name || "U").trim().charAt(0).toUpperCase() || "U");
  return `https://ui-avatars.com/api/?name=${first}&background=1e293b&color=ffffff&size=128`;
}

function showLoggedOutUI() {
  currentUser = null;

  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }

  authSection?.classList.remove("hidden");
  appSection?.classList.add("hidden");

  if (profileAvatar) profileAvatar.src = "";
  if (profileName) profileName.textContent = "";
  if (profileEmail) profileEmail.textContent = "";
  if (usersList) usersList.innerHTML = "";
  if (statusButtons) statusButtons.innerHTML = "";
}

async function startGoogleLogin() {
  clearMessage();

  const redirectTo = window.location.origin + window.location.pathname;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) {
    console.error("Ошибка Google входа:", error);
    showMessage("Ошибка Google входа: " + error.message, "error");
  }
}

async function loadProfiles() {
  if (!currentUser) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Ошибка загрузки profiles:", error);
    showMessage("Ошибка загрузки профилей: " + error.message, "error");
    return;
  }

  const me = data.find((p) => p.id === currentUser.id);

  if (me) {
    if (profileName) profileName.textContent = me.username || "Пользователь";
    if (profileEmail) profileEmail.textContent = me.email || "";
    if (profileAvatar) {
      profileAvatar.src = me.avatar_url || fallbackAvatar(me.username);
      profileAvatar.onerror = () => {
        profileAvatar.src = fallbackAvatar(me.username);
      };
    }
    renderStatusButtons(me.status);
  }

  renderUsers(data);
}

function renderUsers(profiles) {
  if (!usersList || !currentUser) return;

  const others = profiles.filter((p) => p.id !== currentUser.id);

  if (!others.length) {
    usersList.innerHTML = `<div class="user-item">Пока кроме тебя никого нет.</div>`;
    return;
  }

  usersList.innerHTML = others
    .map((user) => {
      const avatar = user.avatar_url || fallbackAvatar(user.username);
      return `
        <div class="user-item">
          <div class="user-left">
            <img
              class="user-avatar"
              src="${escapeHtml(avatar)}"
              alt="avatar"
              onerror="this.src='${escapeHtml(fallbackAvatar(user.username))}'"
            />
            <div class="user-info">
              <div class="user-name">${escapeHtml(user.username)}</div>
              <div class="muted">${escapeHtml(user.email)}</div>
            </div>
          </div>
          <div class="user-status">${escapeHtml(user.status)}</div>
        </div>
      `;
    })
    .join("");
}

function renderStatusButtons(activeStatus) {
  if (!statusButtons || !currentUser) return;

  statusButtons.innerHTML = "";

  STATUSES.forEach((status) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = status;
    btn.className = `status-btn ${status === activeStatus ? "active" : ""}`;

    btn.addEventListener("click", async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentUser.id);

      if (error) {
        console.error("Ошибка статуса:", error);
        showMessage("Ошибка статуса: " + error.message, "error");
        return;
      }

      await loadProfiles();
    });

    statusButtons.appendChild(btn);
  });
}

function subscribeToProfiles() {
  if (channel) {
    supabase.removeChannel(channel);
  }

  channel = supabase
    .channel("profiles-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      async () => {
        if (currentUser) {
          await loadProfiles();
        }
      }
    )
    .subscribe();
}

async function showLoggedInUI(session) {
  currentUser = session.user;

  authSection?.classList.add("hidden");
  appSection?.classList.remove("hidden");

  await loadProfiles();
  subscribeToProfiles();
}

async function bootstrap() {
  clearMessage();

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Ошибка сессии:", error);
    showMessage("Ошибка сессии: " + error.message, "error");
    showLoggedOutUI();
    return;
  }

  if (data.session) {
    await showLoggedInUI(data.session);
  } else {
    showLoggedOutUI();
  }
}

googleLoginBtn?.addEventListener("click", startGoogleLogin);

logoutBtn?.addEventListener("click", async () => {
  clearMessage();

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Ошибка выхода:", error);
    showMessage("Ошибка выхода: " + error.message, "error");
    return;
  }

  showLoggedOutUI();
  showMessage("Вы вышли из аккаунта");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session) {
    await showLoggedInUI(session);
  } else {
    showLoggedOutUI();
  }
});

await bootstrap();
