import { assertEqual, assertIncludes, assertTrue, test, waitFor } from "./runner.js";
import { mountApp } from "./helpers.js";

const catan = { id: "g1", title: "Catan", minPlayers: 3, maxPlayers: 4, durationMinutes: 90, isAvailable: true };
const dixit = { id: "g2", title: "Dixit", minPlayers: 3, maxPlayers: 6, durationMinutes: 30, isAvailable: false };
const tagteam = { id: "g3", title: "Tag Team", minPlayers: 2, maxPlayers: 2, durationMinutes: 15, isAvailable: false };
const camille = { id: "m1", name: "Camille", email: "camille@example.com" };

const cardOf = (app, title) => app.$$("#games-list .card").find((card) => card.querySelector("h3").textContent === title);

// --- Jeux

test("games list shows one card per game with its availability", async () => {
  const app = await mountApp({ "GET /games": [catan, dixit] });
  await waitFor(() => app.$$("#games-list .card").length === 2, "deux cartes de jeu");
  assertIncludes(cardOf(app, "Catan").textContent, "Disponible");
  assertIncludes(cardOf(app, "Dixit").textContent, "Emprunté");
  assertIncludes(cardOf(app, "Catan").textContent, "3 à 4 joueur·ses · 90 min");
});

test("only an available game offers Borrow", async () => {
  const app = await mountApp({ "GET /games": [catan, dixit] });
  await waitFor(() => app.$$("#games-list .card").length === 2);
  const labels = (title) => [...cardOf(app, title).querySelectorAll("button")].map((button) => button.textContent);
  assertTrue(labels("Catan").includes("Emprunter"), "Catan devrait proposer Emprunter");
  assertTrue(!labels("Dixit").includes("Emprunter"), "Dixit est emprunté, il ne doit pas proposer Emprunter");
});

test("with no game, a message invites to add one", async () => {
  const app = await mountApp({ "GET /games": [] });
  await waitFor(() => !app.$("#games-empty").hidden);
  assertIncludes(app.$("#games-empty").textContent, "ne contient aucun jeu");
  assertIncludes(app.$("#games-empty").textContent, "Ajouter un jeu");
});



test("adding a game posts the form then reloads the list", async () => {
  const app = await mountApp({ "GET /games": [catan], "POST /games": [201, { ...catan, id: "g3", title: "Dixit" }] });
  await waitFor(() => app.$$("#games-list .card").length === 1);
  app.click("Ajouter un jeu");
  const form = app.$("#game-form");
  form.elements.title.value = "  Dixit ";
  form.elements.minPlayers.value = "3";
  form.elements.maxPlayers.value = "6";
  form.elements.durationMinutes.value = "30";
  form.requestSubmit();
  await waitFor(() => app.calls.some((call) => call.method === "POST" && call.path === "/games"), "l'appel POST /games");
  assertEqual(app.calls.find((call) => call.method === "POST").body, {
    title: "Dixit",
    minPlayers: 3,
    maxPlayers: 6,
    durationMinutes: 30,
  });
  await waitFor(() => !app.$("#game-dialog").open, "la boîte se ferme");
});

test("a validation error is shown in French and the dialog stays open", async () => {
  const app = await mountApp({
    "GET /games": [],
    "POST /games": [400, { error: true, reason: "title is empty, durationMinutes is less than minimum of 1" }],
  });
  await waitFor(() => !app.$("#games-empty").hidden, "la page est chargée");
  app.click("Ajouter un jeu");
  app.$("#game-form").requestSubmit();
  await waitFor(() => !app.$("#game-dialog .form-error").hidden, "le message d'erreur");
  assertEqual(app.$("#game-dialog .form-error").textContent, "Le titre est obligatoire. La durée doit être d'au moins 1.");
  assertTrue(app.$("#game-dialog").open, "la boîte devrait rester ouverte");
});

test("update an existing game", async () => {
  const app = await mountApp({
    "GET /games": [catan],
    "PUT /games/g1": [200, { ...catan, title: "Dixit" }],
  });
  await waitFor(() => app.$$("#games-list .card").length === 1);

  app.click("Modifier", cardOf(app, "Catan"));
  const form = app.$("#game-form");
  assertEqual(form.elements.title.value, "Catan");

  form.elements.title.value = "  Dixit ";
  form.elements.minPlayers.value = "3";
  form.elements.maxPlayers.value = "6";
  form.elements.durationMinutes.value = "30";
  form.requestSubmit();

  await waitFor(() => app.calls.some((call) => call.method === "PUT" && call.path === "/games/g1"), "l'appel PUT /games/g1");
  assertEqual(app.calls.find((call) => call.method === "PUT").body, {
    title: "Dixit",
    minPlayers: 3,
    maxPlayers: 6,
    durationMinutes: 30,
  });
  await waitFor(() => !app.$("#game-dialog").open, "la boîte se ferme");
});

test("updating a game that no longer exist ", async () => {
  const app = await mountApp({
    "GET /games": [catan],
    "PUT /games/g1": [404, { error: true, reason: "Game not found" }],
  });
  await waitFor(() => app.$$("#games-list .card").length === 1);

  app.click("Modifier", cardOf(app, "Catan"));
  app.$("#game-form").requestSubmit();

  await waitFor(() => !app.$("#game-dialog .form-error").hidden, "le message d'erreur");
  assertIncludes(app.$("#game-dialog .form-error").textContent, "n'existe pas");
  assertTrue(app.$("#game-dialog").open, "le formulaire devrait rester ouvert");
});

test("deleting a game with loans shows a message", async () => {
  const app = await mountApp({
    "GET /games": [dixit],
    "DELETE /games/g2": [409, { error: true, reason: "A game with loans cannot be deleted" }],
  });
  await waitFor(() => app.$$("#games-list .card").length === 1);
  app.click("Supprimer", cardOf(app, "Dixit"))
  app.click("Supprimer", app.$("#delete-dialog"))

  await waitFor(() => !app.$("#delete-dialog .form-error").hidden, "le message d'erreur");
  await waitFor(() => app.$$("#games-list .card").length === 1);
  assertTrue(app.$("#delete-dialog").open, "la confirmation devrait rester ouverte")
});

test("successfully deleting a game", async () => {
  let games = [catan];
  const app = await mountApp({
    "GET /games": () => games,
    "DELETE /games/g1": () => {
      games = [];
      return [204];
    },
  });
  await waitFor(() => app.$$("#games-list .card").length === 1);
  app.click("Supprimer", cardOf(app, "Catan"));
  app.click("Supprimer", app.$("#delete-dialog"));

  await waitFor(() => app.$$("#games-list .card").length === 0, "plus aucune carte");
  assertTrue(!app.$("#delete-dialog").open, "la confirmation devrait se fermer");
});

// --- Emprunts

test("borrowing a game sends the game and the chosen member", async () => {
  const app = await mountApp({
    "GET /games": [catan],
    "GET /members": [camille],
    "POST /loans": [201, { id: "l1", gameID: "g1", memberID: "m1", borrowedAt: new Date().toISOString(), dueAt: new Date().toISOString() }],
  });
  await waitFor(() => app.$$("#games-list .card").length === 1);
  app.click("Emprunter", cardOf(app, "Catan"));
  await waitFor(() => app.$("#borrow-dialog").open, "la boîte d'emprunt");
  app.$("#borrow-form").requestSubmit();
  await waitFor(() => app.calls.some((call) => call.method === "POST" && call.path === "/loans"), "l'appel POST /loans");
  assertEqual(app.calls.find((call) => call.path === "/loans").body, { gameID: "g1", memberID: "m1" });
  await waitFor(() => app.$("#toasts").textContent.includes("emprunté"), "le message de confirmation");
});

test("borrowing without any member explains that one must be added first", async () => {
  const app = await mountApp({ "GET /games": [catan], "GET /members": [] });
  await waitFor(() => app.$$("#games-list .card").length === 1);
  app.click("Emprunter", cardOf(app, "Catan"));
  await waitFor(() => app.$("#toasts").textContent.includes("Ajoutez d'abord"), "le message d'aide");
  assertTrue(!app.$("#borrow-dialog").open, "la boîte d'emprunt ne doit pas s'ouvrir");
});

const catanLoan = { 
  id: "l1", 
  gameID: "g1", 
  memberID: "m1", 
  borrowedAt: "2020-01-01T12:00:00Z", 
  dueAt: "2020-01-15T12:00:00Z", 
  returnedAt: "2020-01-10T12:00:00Z" 
};
const dixitLoan = { 
  id: "l2", 
  gameID: "g2", 
  memberID: "m1", 
  borrowedAt: "2999-01-01T12:00:00Z",
  dueAt: "2999-01-15T12:00:00Z", 
  returnedAt: null 
};
const tagteamLoan = { 
  id: "l3", 
  gameID: "g3", 
  memberID: "m1", 
  borrowedAt: "2020-02-01T12:00:00Z", 
  dueAt: "2020-02-15T12:00:00Z", 
  returnedAt: null };

test("list member loans with all status", async () => {
  const app = await mountApp(
    {
      "GET /members": [camille],
      "GET /games": [catan, dixit, tagteam],
      "GET /members/m1/loans": [catanLoan, dixitLoan, tagteamLoan],
    },
    { hash: "#members" },
  );
  await waitFor(() => app.$$("#members-list .row").length === 1);
  app.click("Emprunts", app.$("#members-list .row"));
  await waitFor(() => app.$("#loans-dialog").open, "la boîte de liste d'emprunts");
  await waitFor(() => app.$$("#loans-list .row").length === 3, "les 3 emprunts");

  const rows = app.$$("#loans-list .row");
  assertIncludes(rows[0].textContent, "Catan");
  assertIncludes(rows[0].textContent, "Rendu");
  assertIncludes(rows[1].textContent, "Dixit");
  assertIncludes(rows[1].textContent, "En cours");
  assertIncludes(rows[2].textContent, "Tag Team");
  assertIncludes(rows[2].textContent, "En retard");
});

test("list member loans with no loans", async () => {
  const app = await mountApp(
    {
      "GET /members": [camille],
      "GET /games": [catan],
      "GET /members/m1/loans": [],
    },
    { hash: "#members" },
  );
  await waitFor(() => app.$$("#members-list .row").length === 1);
  app.click("Emprunts", app.$("#members-list .row"));
  await waitFor(() => app.$("#loans-dialog").open, "la boîte de liste d'emprunts");
  assertEqual(app.$$("#loans-list .row").length, 0);
  assertTrue(!app.$("#loans-empty").hidden, "le message de liste vide devrait être visible");
});

// --- Adhérent·es

test("members tab lists the members", async () => {
  const app = await mountApp({ "GET /members": [camille] }, { hash: "#members" });
  await waitFor(() => app.$$("#members-list .row").length === 1);
  assertIncludes(app.$("#members-list .row").textContent, "Camille");
  assertIncludes(app.$("#members-list .row").textContent, "camille@example.com");
});

test("with no member, a message invites to add one", async () => {
  const app = await mountApp({ "GET /members": [] }, { hash: "#members" });
  await waitFor(() => !app.$("#members-empty").hidden);
  assertIncludes(app.$("#members-empty").textContent, "Ajouter un·e adhérent·e");
});

test("adding a member posts the form", async () => {
  const app = await mountApp({ "GET /members": [], "POST /members": [201, camille] }, { hash: "#members" });
  await waitFor(() => !app.$("#members-empty").hidden);
  app.click("Ajouter un·e adhérent·e");
  const form = app.$("#member-form");
  form.elements.name.value = " Camille ";
  form.elements.email.value = "camille@example.com";
  form.requestSubmit();
  await waitFor(() => app.calls.some((call) => call.method === "POST" && call.path === "/members"), "l'appel POST /members");
  assertEqual(app.calls.find((call) => call.method === "POST").body, { name: "Camille", email: "camille@example.com" });
});

test("an email already in use is shown in French", async () => {
  const app = await mountApp(
    { "GET /members": [], "POST /members": [409, { error: true, reason: "A member with this email already exists" }] },
    { hash: "#members" },
  );
  await waitFor(() => !app.$("#members-empty").hidden);
  app.click("Ajouter un·e adhérent·e");
  app.$("#member-form").requestSubmit();
  await waitFor(() => !app.$("#member-dialog .form-error").hidden, "le message d'erreur");
  assertIncludes(app.$("#member-dialog .form-error").textContent, "utilise déjà cette adresse e-mail");
});

test("update an existing member", async () => {
  const app = await mountApp({
    "GET /members": [camille],
    "PUT /members/m1": [200, { ...camille, name: "Caca" }],
  }, { hash: "#members" });
  await waitFor(() => app.$$("#members-list .row").length === 1);

  app.click("Modifier", app.$("#members-list .row"));
  const form = app.$("#member-form");
  assertEqual(form.elements.name.value, "Camille");
  assertEqual(form.elements.email.value, "camille@example.com");

  form.elements.name.value = "  Caca ";
  form.requestSubmit();

  await waitFor(() => app.calls.some((call) => call.method === "PUT" && call.path === "/members/m1"), "l'appel PUT /members/m1");
  assertEqual(app.calls.find((call) => call.method === "PUT").body, {
    name: "Caca",
    email: "camille@example.com",
  });
  await waitFor(() => !app.$("#member-dialog").open, "la boîte se ferme");
});

test("updating a member that no longer exists", async () => {
  const app = await mountApp({
    "GET /members": [camille],
    "PUT /members/m1": [404, { error: true, reason: "Member not found" }],
  }, { hash: "#members" });
  await waitFor(() => app.$$("#members-list .row").length === 1);

  app.click("Modifier", app.$("#members-list .row"));
  app.$("#member-form").requestSubmit();

  await waitFor(() => !app.$("#member-dialog .form-error").hidden, "le message d'erreur");
  assertIncludes(app.$("#member-dialog .form-error").textContent, "n'existe pas");
  assertTrue(app.$("#member-dialog").open, "le formulaire devrait rester ouvert");
});

test("deleting a member with loans shows a message", async () => {
  const app = await mountApp({
    "GET /members": [camille],
    "DELETE /members/m1": [409, { error: true, reason: "A member with loans cannot be deleted" }],
  }, { hash: "#members" });
  await waitFor(() => app.$$("#members-list .row").length === 1);
  app.click("Supprimer", app.$("#members-list .row"))
  app.click("Supprimer", app.$("#delete-member-dialog"))

  await waitFor(() => !app.$("#delete-member-dialog .form-error").hidden, "le message d'erreur");
  await waitFor(() => app.$$("#members-list .row").length === 1);
  assertTrue(app.$("#delete-member-dialog").open, "la confirmation devrait rester ouverte")
});

test("successfully deleting a member", async () => {
  let members = [camille];
  const app = await mountApp({
    "GET /members": () => members,
    "DELETE /members/m1": () => {
      members = [];
      return [204];
    },
  }, { hash: "#members" });
  await waitFor(() => app.$$("#members-list .row").length === 1);
  app.click("Supprimer", app.$("#members-list .row"));
  app.click("Supprimer", app.$("#delete-member-dialog"));

  await waitFor(() => app.$$("#members-list .row").length === 0, "plus aucune ligne");
  assertTrue(!app.$("#delete-member-dialog").open, "la confirmation devrait se fermer");
});
