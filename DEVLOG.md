> Total Hours Spent: 4

# 5/5/2026

Welcome to my devlog! Ill write in here each time I work on this project so that anyone who is interested can
follow along! (and so I can keep track of what I'm doing lol!)

Today is the first day of this project so I did some setting up. Github, VSCode Extenstions, and dependencies.

### 5/5/2026, three hours later

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


# 5/6/2026

Today I started with adding admin authentication, simply added a method in the authMiddleware called adminProtect which calls
protect, making sure to catch the next call from protect so that the admin check does not get bypassed, then checks the user role 
for admin, passing to next if successful, otherwise throw a generic 'Not Authorized' message to not reveal admin endpoints.

Then we build the actual endpoint, in this case, updateUserStatus. Since this software will run on a white-list based system
I will set every new account to the 'pending' status by default, then an admin will have to set the status to 'active' so that 
every account created cannot use the platform until it has been personally verified by me. This is not standard on most programs
but this will work perfectly since this is only intended to be used by my close friends and family and will prevent bad actors from
accessing. So this endpoint will be used by the admin to update the users status.

Finally I connect this method to an endpoint, protected it with our new adminProtect middleware, and tested it! Went almost perfectly,
intially forgot to point my mongo connection to my specfic database and was very confused why my credentials weren't working. Also
intially forgot to add await before finding the user who's status I wanted to update and was confused why it wasnt finding any users.
After fixing those two issues our new endpoint is fully functional!