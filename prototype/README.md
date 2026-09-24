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

## Organizer attendance

After admin login, open **Manage** on an event and select **Check myself in**.
The app uses the signed-in admin's student ID and name, records them as present
with the method `organizer`, and stays on the event screen. No ID re-entry or
account switching is needed. The button becomes **Already present** when that
student ID is already in the event, including attendance scanned by another officer.

**My QR** displays the admin's student QR for another officer to scan instead.
Organizer attendance is labeled in the attendee list, event history, and attendance
records and is saved locally with a pending sync status. This is an explicit
self-declaration of attendance; the prototype allows any logged-in admin managing
an event to use it and does not implement event-specific officer assignments.

## Prototype limits

Both login screens offer **Forgot password?**. Enter the account's registered
email, verify the auto-filled demo code, then enter and confirm a new password.
The reset changes only the password and returns to the corresponding login.
Student and admin resets are separate, even when they share an email. If multiple
student accounts share an email, enter the student ID when prompted.
Reset codes expire after 15 minutes (including password entry), are consumed on
verification, and are cleared when recovery is cancelled. No email is sent and
email ownership is not actually verified in this prototype.

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
