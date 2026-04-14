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

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");

const registerUsername = document.getElementById("registerUsername");
const registerEmail = document.getElementById("registerEmail");
const registerPassword = document.getElementById("registerPassword");

const authSection = document.getElementById("authSection");
const appSection = document.getElementById("appSection");

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

function showLoggedOutUI() {
  currentUser = null;
  authSection?.classList.remove("hidden");
  appSection?.classList.add("hidden");
}

async function showLoggedInUI(session) {
  currentUser = session.user;
  authSection?.classList.add("hidden");
  appSection?.classList.remove("hidden");

  if (profileEmail) {
    profileEmail.textContent = session.user.email ?? "";
  }

  await loadProfiles();
  subscribeToProfiles();
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
    if (profileName) profileName.textContent = me.username;
    if (profileEmail) profileEmail.textContent = me.email;
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
    .map(
      (user) => `
        <div class="user-item">
          <div class="user-info">
            <div class="user-name">${escapeHtml(user.username)}</div>
            <div class="muted">${escapeHtml(user.email)}</div>
          </div>
          <div class="user-status">${escapeHtml(user.status)}</div>
        </div>
      `
    )
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
        console.error("Ошибка обновления статуса:", error);
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

async function bootstrap() {
  clearMessage();

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Ошибка getSession:", error);
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

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage();

    try {
      const username = registerUsername.value.trim();
      const email = registerEmail.value.trim();
      const password = registerPassword.value.trim();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      });

      if (error) {
        console.error("Ошибка регистрации:", error);
        showMessage("Ошибка регистрации: " + error.message, "error");
        return;
      }

      console.log("Регистрация:", data);
      showMessage("Регистрация успешна. Теперь войди в аккаунт.");
      registerForm.reset();
    } catch (err) {
      console.error("Сбой регистрации:", err);
      showMessage("Сбой регистрации: " + err.message, "error");
    }
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage();

    try {
      const email = loginEmail.value.trim();
      const password = loginPassword.value.trim();

      console.log("Вход нажат");

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Ошибка входа:", error);
        showMessage("Ошибка входа: " + error.message, "error");
        return;
      }

      console.log("Успешный вход:", data);
      showMessage("Вход выполнен");
      loginForm.reset();

      if (data.session) {
        await showLoggedInUI(data.session);
      }
    } catch (err) {
      console.error("Сбой входа:", err);
      showMessage("Сбой входа: " + err.message, "error");
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    showLoggedOutUI();
    showMessage("Вы вышли из аккаунта");
  });
}

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session) {
    await showLoggedInUI(session);
  } else {
    showLoggedOutUI();
  }
});

await bootstrap();
