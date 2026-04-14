import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://gdnajqgqlxzuburfzgtr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_w_0fS1tnQZ1hgB8pML0rog_Mx_Ev9Yd";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
let currentProfile = null;
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

async function loadProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Ошибка загрузки profiles:", error);
    showMessage(error.message, "error");
    return;
  }

  if (!data) return;

  currentProfile = data.find((p) => p.id === currentUser.id) || null;

  if (currentProfile) {
    if (profileName) profileName.textContent = currentProfile.username;
    if (profileEmail) profileEmail.textContent = currentProfile.email;
    renderStatusButtons(currentProfile.status);
  }

  renderUsers(data);
}

function renderUsers(profiles) {
  if (!usersList) return;

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
  if (!statusButtons) return;

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
          updated_at: new Date().toISOString()
        })
        .eq("id", currentUser.id);

      if (error) {
        console.error("Ошибка обновления статуса:", error);
        showMessage(error.message, "error");
        return;
      }

      showMessage("Статус обновлен");
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

async function renderApp() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Ошибка сессии:", error);
    showMessage(error.message, "error");
    return;
  }

  if (!data.session) {
    currentUser = null;
    currentProfile = null;
    if (authSection) authSection.classList.remove("hidden");
    if (appSection) appSection.classList.add("hidden");
    return;
  }

  currentUser = data.session.user;

  if (authSection) authSection.classList.add("hidden");
  if (appSection) appSection.classList.remove("hidden");

  await loadProfiles();
  subscribeToProfiles();
}

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage();

    const username = registerUsername.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value.trim();

    console.log("Регистрация нажата");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });

    if (error) {
      console.error("Ошибка регистрации:", error);
      showMessage(error.message, "error");
      return;
    }

    console.log("Регистрация успешна:", data);
    showMessage("Регистрация успешна, теперь войди в аккаунт.");
    registerForm.reset();
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
      console.log("До запроса", email);

      const result = await supabase.auth.signInWithPassword({
        email,
        password
      });

      console.log("После запроса", result);

      const { data, error } = result;

      if (error) {
        console.error("Ошибка входа:", error);
        showMessage("Ошибка входа: " + error.message, "error");
        return;
      }

      if (!data?.session) {
        showMessage("Сессия не создана", "error");
        return;
      }

      showMessage("Вход выполнен");
      loginForm.reset();
      await renderApp();
    } catch (err) {
      console.error("Поймано исключение:", err);
      showMessage("Сбой: " + err.message, "error");
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    showMessage("Вы вышли из аккаунта");
    await renderApp();
  });
}

supabase.auth.onAuthStateChange(async () => {
  await renderApp();
});

await renderApp();
