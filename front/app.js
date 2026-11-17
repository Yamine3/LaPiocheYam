import { API_URL } from "./config.js";
import { api } from "./api.js";

const $ = (selector, root = document) => root.querySelector(selector);

$("#docs-link").href = API_URL;

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const formatDate = (iso) => dateFormat.format(new Date(iso));

// Construit un élément sans jamais passer par innerHTML : les données de
// l'API (titres, noms) sont insérées comme du texte.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function button(label, onClick, className = "") {
  return el("button", { type: "button", class: className, onclick: onClick }, label);
}

function toast(message, isError = false) {
  const node = el("p", { class: isError ? "toast error" : "toast" }, message);
  $("#toasts").append(node);
  setTimeout(() => node.remove(), 5000);
}

// Exécute une action déclenchée par un bouton et affiche l'erreur de l'API.
async function run(action) {
  try {
    await action();
  } catch (error) {
    toast(error.message, true);
  }
}

function showFormError(dialog, error) {
  const target = $(".form-error", dialog);
  target.textContent = error ? error.message : "";
  target.hidden = !error;
}

for (const cancel of document.querySelectorAll("[data-cancel]")) {
  cancel.addEventListener("click", () => cancel.closest("dialog").close());
}

// Branche un formulaire de boîte de dialogue sur un appel à l'API.
// L'erreur renvoyée par l'API reste affichée dans la boîte, qui ne se ferme
// qu'en cas de succès.
function bindSubmit(dialog, form, handler) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(dialog, null);
    try {
      await handler(new FormData(form));
      dialog.close();
      await refresh();
    } catch (error) {
      showFormError(dialog, error);
    }
  });
}

// --- Onglets ---------------------------------------------------------------

const tabs = ["games", "members"];

function currentTab() {
  const name = location.hash.slice(1);
  return tabs.includes(name) ? name : "games";
}

async function refresh() {
  const tab = currentTab();
  for (const name of tabs) {
    $(`#${name}`).hidden = name !== tab;
    $(`[data-tab="${name}"]`).toggleAttribute("aria-current", name === tab);
  }
  await run(tab === "games" ? loadGames : loadMembers);
}

window.addEventListener("hashchange", refresh);

// --- Jeux ------------------------------------------------------------------

async function loadGames() {
  const games = await api.listGames();
  $("#games-empty").hidden = games.length > 0;
  $("#games-list").replaceChildren(...games.map(gameCard));
}

function gameCard(game) {
  const players =
    game.minPlayers === game.maxPlayers ? `${game.minPlayers}` : `${game.minPlayers} à ${game.maxPlayers}`;
  const status = game.isAvailable
    ? el("span", { class: "badge ok" }, "Disponible")
    : el("span", { class: "badge busy" }, "Emprunté");

  const actions = el("div", { class: "actions" });
  if (game.isAvailable) {
    actions.append(button("Emprunter", () => openBorrowDialog(game), "primary"));
  }

  actions.append(button("Modifier", () => openEditDialog(game)));

  actions.append(button("Supprimer", () => openDeleteDialog(game), "danger"));

  return el(
    "li",
    { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, game.title), status),
    el("p", { class: "meta" }, `${players} joueur·ses · ${game.durationMinutes} min`),
    actions,
  );
}

const gameDialog = $("#game-dialog");
const gameForm = $("#game-form");
const deleteDialog = $("#delete-dialog");
let editedGame = null;
let gameToDelete = null;

$("#add-game").addEventListener("click", () => {
  editedGame = null;
  gameForm.reset();
  showFormError(gameDialog, null);
  gameDialog.showModal();
});

bindSubmit(gameDialog, gameForm, function (data) {
  const game = {
    title: data.get("title").trim(),
    minPlayers: Number(data.get("minPlayers")),
    maxPlayers: Number(data.get("maxPlayers")),
    durationMinutes: Number(data.get("durationMinutes")),
  };

  if (editedGame === null) {
    return api.createGame(game);
  } else {
    return api.updateGame(editedGame.id, game);
  }
});

function openEditDialog(game) {
  editedGame = game;
  gameForm.elements.title.value = game.title;
  gameForm.elements.minPlayers.value = game.minPlayers;
  gameForm.elements.maxPlayers.value = game.maxPlayers;
  gameForm.elements.durationMinutes.value = game.durationMinutes;
  gameDialog.showModal();
}

function openDeleteDialog(game) {
  gameToDelete = game;
  $("#delete-message").textContent = "Voulez-vous vraiment supprimer « " + game.title + " » ?";
  showFormError(deleteDialog, null);
  deleteDialog.showModal();
}

$("#confirm-delete").addEventListener("click", async function () {
  showFormError(deleteDialog, null);
  try {
    await api.deleteGame(gameToDelete.id);
    deleteDialog.close();
    await refresh();
  } catch (error) {
    showFormError(deleteDialog, error);
  }
});

function findGame(games, gameID) {
  for(const game of games) {
    if (game.id == gameID) {
      return game;
    }
  }
  return null;
}

// --- Emprunts --------------------------------------------------------------

const borrowDialog = $("#borrow-dialog");
const borrowForm = $("#borrow-form");
let borrowedGame = null;

async function openBorrowDialog(game) {
  await run(async () => {
    const members = await api.listMembers();
    if (members.length === 0) {
      toast("Ajoutez d'abord un·e adhérent·e pour pouvoir emprunter.", true);
      return;
    }
    borrowedGame = game;
    $("#borrow-dialog-title").textContent = `Emprunter « ${game.title} »`;
    $("select", borrowForm).replaceChildren(
      ...members.map((member) => el("option", { value: member.id }, `${member.name} (${member.email})`)),
    );
    showFormError(borrowDialog, null);
    borrowDialog.showModal();
  });
}

bindSubmit(borrowDialog, borrowForm, async (data) => {
  const loan = await api.borrow(borrowedGame.id, data.get("memberID"));
  toast(`« ${borrowedGame.title} » emprunté, à rendre avant le ${formatDate(loan.dueAt)}.`);
});

function loanStatusBadge(loan) {
  if (loan.returnedAt) {
    return el("span", { class: "badge ok" }, "Rendu");
  }
  if (new Date(loan.dueAt) < new Date()) {
    return el("span", { class: "badge late" }, "En retard");
  }
  return el("span", { class: "badge busy" }, "En cours");
}

function loanRow(loan, games) {
  const game = findGame(games, loan.gameID);

  let title = "Jeu inconnu";
  if (game !== null) {
    title = game.title;
  }

  return el(
    "li",
    { class: "row" },
    el(
      "div",
      { class: "row-main" },
      el("p", {}, el("strong", {}, title)),
      el("p", { class: "infos-loans" }, "Emprunté le " + formatDate(loan.borrowedAt) + " · à rendre avant le " + formatDate(loan.dueAt)),
    ),
    loanStatusBadge(loan),
  );
}

const loansDialog = $("#loans-dialog");

async function openLoansDialog(member) {
  await run(async function () {
    const loans = await api.listMemberLoans(member.id);
    const games = await api.listGames();

    $("#loans-dialog-title").textContent = "Emprunts de " + member.name;
    $("#loans-empty").hidden = loans.length > 0;
    $("#loans-list").replaceChildren(...loans.map((loan) => loanRow(loan, games)));

    loansDialog.showModal();
  });
}


// --- Adhérent·es -----------------------------------------------------------

async function loadMembers() {
  const members = await api.listMembers();
  $("#members-empty").hidden = members.length > 0;
  $("#members-list").replaceChildren(...members.map(memberRow));
}

function memberRow(member) {
  const actions = el("div", { class: "actions" });
  actions.append(button("Modifier", () => openEditMemberDialog(member)));
  actions.append(button("Supprimer", () => openDeleteMemberDialog(member), "danger"));
  actions.append(button("Emprunts", () => openLoansDialog(member)));

  return el(
    "li",
    { class: "row" },
    el("div", { class: "row-main" }, el("p", {}, el("strong", {}, member.name)), el("p", { class: "meta" }, member.email)),
    actions
  );
}

const memberDialog = $("#member-dialog");
const memberForm = $("#member-form");
const deleteMemberDialog = $("#delete-member-dialog");
let editedMember = null;
let memberToDelete = null;

$("#add-member").addEventListener("click", () => {
  editedMember = null;
  memberForm.reset();
  showFormError(memberDialog, null);
  memberDialog.showModal();
});

bindSubmit(memberDialog, memberForm, function (data) {
  const member = {
    name: data.get("name").trim(),
    email: data.get("email").trim(),
  };

  if (editedMember === null) {
    return api.createMember(member);
  } else {
    return api.updateMember(editedMember.id, member);
  }
});

function openEditMemberDialog(member) {
  editedMember = member;
  memberForm.elements.name.value = member.name;
  memberForm.elements.email.value = member.email;
  memberDialog.showModal();
}

function openDeleteMemberDialog(member) {
  memberToDelete = member;
  $("#delete-member-message").textContent = "Voulez-vous vraiment supprimer « " + member.name + " » ?";
  showFormError(deleteMemberDialog, null);
  deleteMemberDialog.showModal();
}

$("#confirm-delete-member").addEventListener("click", async function () {
  showFormError(deleteMemberDialog, null);
  try {
    await api.deleteMember(memberToDelete.id);
    deleteMemberDialog.close();
    await refresh();
  } catch (error) {
    showFormError(deleteMemberDialog, error);
  }
});

refresh();
