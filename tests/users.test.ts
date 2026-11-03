import test from "node:test";
import assert from "node:assert/strict";
import {
  clerkProjectSettings,
  productionClerkVariable,
  registeredUser,
  usersQuery,
  usersSourceQuery,
} from "../src/lib/user-data";

test("usuarios: valida el equipo y el proyecto sin admitir rutas arbitrarias", () => {
  const request = (query: string) =>
    new Request(`https://urithiru.test/api/users?${query}`);
  assert.deepEqual(
    usersSourceQuery(request("team=team_abc&project=prj_replay")),
    { teamId: "team_abc", projectId: "prj_replay" },
  );
  assert.deepEqual(usersSourceQuery(request("team=&project=diariamente")), {
    teamId: "",
    projectId: "diariamente",
  });
  for (const query of [
    "team=otro",
    "project=../diariamente",
    "project=https://evil.test",
    `project=${"a".repeat(101)}`,
  ]) {
    assert.throws(
      () => usersSourceQuery(request(query)),
      (error: unknown) => (error as { status: number }).status === 400,
    );
  }
});

test("usuarios: solo detecta la clave de Clerk del entorno de producción", () => {
  const production = {
    key: "CLERK_SECRET_KEY",
    target: ["production"],
    id: "live",
  };
  assert.equal(
    productionClerkVariable([
      {
        key: "CLERK_SECRET_KEY",
        target: ["preview", "development"],
        id: "dev",
      },
      { key: "OTHER_CLERK_SECRET_KEY", target: ["production"] },
      { ...production, gitBranch: "feature" },
      production,
    ]),
    production,
  );
  assert.equal(
    productionClerkVariable([{ key: "CLERK_SECRET_KEY", target: "production" }])
      ?.key,
    "CLERK_SECRET_KEY",
  );
  assert.equal(
    productionClerkVariable([{ key: "CLERK_SECRET_KEY", target: ["preview"] }]),
    undefined,
  );
});

test("usuarios: la facturación de DiariaMente no se aplica a otros proyectos", () => {
  assert.equal(clerkProjectSettings("replay").name, "rePlay");
  assert.equal(
    clerkProjectSettings("replay").secretKeyVariable,
    "REPLAY_CLERK_SECRET_KEY",
  );
  assert.equal(clerkProjectSettings("replay").billing, false);
  assert.equal(clerkProjectSettings("diariamente-web").billing, true);
  assert.equal(
    clerkProjectSettings("diariamente-web").secretKeyVariable,
    "DIARIAMENTE_CLERK_SECRET_KEY",
  );
  assert.equal(clerkProjectSettings("diariamente-landing").billing, false);
  assert.equal(
    clerkProjectSettings("urithiru").secretKeyVariable,
    "URITHIRU_CLERK_SECRET_KEY",
  );
});

test("usuarios: valida filtros y páginas antes de consultar Clerk", () => {
  const request = (query: string) =>
    new Request(`https://urithiru.test/api/users?${query}`);
  assert.deepEqual(usersQuery(request("")), { page: 0, period: 0, query: "" });
  assert.deepEqual(usersQuery(request("page=2&period=7&q=%20Ana%20")), {
    page: 2,
    period: 7,
    query: "Ana",
  });
  for (const query of [
    "page=-1",
    "page=1.5",
    "page=NaN",
    "page=Infinity",
    "page=100001",
    "period=2",
    `q=${"a".repeat(201)}`,
  ])
    assert.throws(
      () => usersQuery(request(query)),
      (error: unknown) => (error as { status: number }).status === 400,
    );
});

test("usuarios: solo expone campos permitidos y verifica únicamente el correo principal", () => {
  const user = {
    id: "user_1",
    firstName: "Ana",
    lastName: "Pérez",
    username: "ana",
    primaryEmailAddressId: "primary",
    createdAt: 1234,
    lastSignInAt: null,
    emailAddresses: [
      {
        id: "other",
        emailAddress: "other@example.test",
        verification: { status: "verified" },
      },
      {
        id: "primary",
        emailAddress: "ana@example.test",
        verification: { status: "unverified" },
      },
    ],
    privateMetadata: { secret: "never-return" },
  };
  assert.deepEqual(registeredUser(user), {
    id: "user_1",
    name: "Ana Pérez",
    email: "ana@example.test",
    emailVerified: false,
    createdAt: 1234,
    lastSignInAt: null,
  });
  assert.deepEqual(
    registeredUser({
      ...user,
      firstName: null,
      lastName: null,
      username: null,
      primaryEmailAddressId: null,
      emailAddresses: [],
    }),
    {
      id: "user_1",
      name: "Sin nombre",
      email: null,
      emailVerified: false,
      createdAt: 1234,
      lastSignInAt: null,
    },
  );
});
