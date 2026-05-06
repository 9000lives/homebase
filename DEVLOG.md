# 5/5/2026

Welcome to my devlog! Ill write in here each time I work on this project so that anyone who is interested can
follow along! (and so I can keep track of what I'm doing lol!)

Today is the first day of this project so I did some setting up. Github, VSCode Extenstions, and dependencies.

## 5/5/2026, three hours later

After setting up my project I started working on my user database. Created a user Model with email, passwordHash,
displayName, role, status, and createdAt. I then used this usermodel in a controller and created registerUser,
loginUser, getMe, and generateToken methods.  I also setup authMiddleware, which is just slightly modified from
my in-class notes from CS 355 at SVSU. (Thank you Professor Bibek!)

The registerUser method takes a name, email, and password from the client, validates that all fields are complete, then,
checks if a user already exsists with that email. After verifying that no pre-exsisting user it will hash the password and,
create a user in the database. Then respond with the new user object and a JWT so the user doesnt have to immediately login.

The loginUser method takes an email and password, validates them. Then if the credentials are valid, returns a JWT token.

The getMe method is a protected method that returns an entire user object

The generateToken method is a method only used in the userController to generate JWT tokens when a user is registered or logged in.

The authMiddleware simply validates that any given JWT token is valid and before allowing a protected method to run. The reason
I say it's slightly modified is that we not only have to validate the JWT token but also check that the user is active, not pending
or suspended.