import test from "node:test";
import assert from "node:assert/strict";
import { registeredUser, usersQuery } from "../src/lib/user-data";

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
