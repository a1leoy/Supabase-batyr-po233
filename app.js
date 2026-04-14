import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "ВСТАВЬ_СЮДА_SUPABASE_URL";
const SUPABASE_ANON_KEY = "ВСТАВЬ_СЮДА_SUPABASE_ANON_KEY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUSES = ["учусь", "кофе", "в игре", "дома"];
const REDIRECT_URL = window.location.origin + window.location.pathname;

const authSection = document.getElementById("authSection");
const appSection = document.getElementById("appSection");
const usersList = document.getElementById("usersList");
const statusButtons = document.getElementById("statusButtons");
const messageBox = document.getElementById("message");

const profileName = document.getElementById("profileName");
const profileEmail = document.getElementById("profileEmail");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const logoutBtn = document.getElementById("logoutBtn");

let currentUser = null;
let currentProfile = null;
let profilesChannel = null;

function showMessage(text, type = "success") {
  messageBox.textContent = text;
  messageBox.className = `message ${type}`;
  messageBox.classList.remove("hidden");
}

function clearMessage() {
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

async function ensureProfile(user, preferredUsername = "") {
  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error(selectError);
    return null;
  }

  if (existing) return existing;

  const fallbackUsername =
    preferredUsername?.trim() ||
    user.user_metadata?.username ||
    user.email?.split("@")[0] ||
    "Пользователь";

  const newProfile = {
    id: user.id,
    email: user.email,
    username: fallbackUsername,
    status: "учусь",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("profiles")
    .insert(newProfile)
    .select()
    .single();

  if (error) {
    console.error(error);
    showMessage("Не удалось создать профиль.", "error");
    return null;
  }

  return data;
}

function renderStatusButtons(activeStatus) {
  statusButtons.innerHTML = "";

  STATUSES.forEach((status) => {
    const btn = document.createElement("button");
    btn.textContent = status;
    btn.className = `status-btn ${activeStatus === status ? "active" : ""}`;
    btn.addEventListener("click", async () => {
      await updateStatus(status);
    });
    statusButtons.appendChild(btn);
  });
}

async function updateStatus(status) {
  if (!currentUser) return;

  const { error } = await supabase
    .from("profiles")
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq("id", currentUser.id);

  if (error) {
    console.error(error);
    showMessage("Не удалось обновить статус.", "error");
    return;
  }

  currentProfile.status = status;
  renderStatusButtons(status);
  showMessage("Статус обновлен.");
}

function renderUsers(profiles) {
  const others = profiles.filter((p) => p.id !== currentUser.id);

  if (!others.length) {
    usersList.innerHTML = `<div class="user-item">Пока кроме тебя никого нет.</div>`;
    return;
  }

  usersList.innerHTML = others
    .map((user) => {
      return `
        <div class="user-item">
          <div class="user-info">
            <div class="user-name">${escapeHtml(user.username)}</div>
            <div class="muted">${escapeHtml(user.email)}</div>
          </div>
          <div class="user-status">${escapeHtml(user.status)}</div>
        </div>
      `;
    })
    .join("");
}

async function loadProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error(error);
    showMessage("Не удалось загрузить пользователей.", "error");
    return;
  }

  currentProfile = data.find((p) => p.id === currentUser.id) || null;

  if (!currentProfile) {
    currentProfile = await ensureProfile(currentUser);
    if (!currentProfile) return;
    return loadProfiles();
  }

  profileName.textContent = currentProfile.username;
  profileEmail.textContent = currentProfile.email;
  renderStatusButtons(currentProfile.status);
  renderUsers(data);
}

function subscribeToProfiles() {
  if (profilesChannel) {
    supabase.removeChannel(profilesChannel);
  }

  profilesChannel = supabase
    .channel("profiles-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profiles"
      },
      async () => {
        if (currentUser) {
          await loadProfiles();
        }
      }
    )
    .subscribe();
}

async function renderApp() {
  clearMessage();

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error(error);
    showMessage("Ошибка получения сессии.", "error");
    return;
  }

  const session = data.session;

  if (!session) {
    currentUser = null;
    currentProfile = null;
    authSection.classList.remove("hidden");
    appSection.classList.add("hidden");
    return;
  }

  currentUser = session.user;
  authSection.classList.add("hidden");
  appSection.classList.remove("hidden");

  await ensureProfile(currentUser);
  await loadProfiles();
  subscribeToProfiles();
}

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();

  const username = document.getElementById("registerUsername").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: REDIRECT_URL,
      data: {
        username
      }
    }
  });

  if (error) {
    console.error(error);
    showMessage(error.message, "error");
    return;
  }

  if (data.session) {
    await ensureProfile(data.user, username);
    showMessage("Регистрация успешна.");
    registerForm.reset();
    await renderApp();
  } else {
    showMessage("Аккаунт создан. Подтверди email и затем войди.", "success");
    registerForm.reset();
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error(error);
    showMessage("Неверный email или пароль.", "error");
    return;
  }

  await ensureProfile(data.user);
  showMessage("Вход выполнен.");
  loginForm.reset();
  await renderApp();
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  showMessage("Вы вышли из аккаунта.");
  await renderApp();
});

supabase.auth.onAuthStateChange(async () => {
  await renderApp();
});

await renderApp();
