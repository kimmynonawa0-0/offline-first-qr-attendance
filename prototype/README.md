# Browser prototype

Open `index.html` in a browser. Admin signup and login use browser storage and
do not need the separate Python/PostgreSQL authentication example.

## Admin signup

1. Choose **Admin Login**, then **Sign Up**.
2. Enter `okims@gmail.com` or `test@example.com`.
3. Verify the automatically filled authorization key.
4. Enter student ID, full name, password, and password confirmation. The
   verified email is already filled in.
5. Log in using that email and the password you created.

Edit `ALLOWED_ADMIN_EMAILS` near the top of `script.js` to change the approved
emails. It starts with the same addresses as `simple_authentication.py`; the
two examples are independent, so changing one does not update the other.
The old `admin@school.com` / `password` shortcut is replaced by signup.

Admin records use the `mock_admins` localStorage key, separately from student
accounts. They persist across reloads in the same browser and origin. Clearing
browser storage removes them. The registration fields follow student signup;
an existing student account is not required.

## Prototype limits

No email is sent. Keys are generated in the browser, expire after 15 minutes,
and are discarded after verification or cancellation. Registration must also
finish within that time. Accounts, including passwords, are stored as plain
text locally, matching the existing student prototype. Use demo passwords only.

This demonstrates the interaction, not secure authorization. Hashing a key in
the browser cannot protect an allowlist or admin role controlled by browser
code. A production version needs trusted server verification, actual email
delivery, single-use expiring tokens, and appropriately hashed passwords.

Run the authentication flow checks with Node.js:

```sh
node --test prototype/admin-auth.test.cjs
```
