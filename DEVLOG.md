> Total Hours Spent: 10

# 5/5/2026

Welcome to my devlog! Ill write in here each time I work on this project so that anyone who is interested can
follow along as the project evolves over time!

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

# 5/7/2026

Writing this a few hours later because I had to go to work. But we are back to document what I did today!

Today was one of the most confusing so far but I learned a lot! All the previous functionality I had already dabbled with in class,
but file upload/download is completely new to me. For this project I am using multer to handle my file uploads, which is completely new to me.
We added uploadMiddleware, fileModel, folderModel, fileRoutes, fileController. fileModel and folderModel are simply the mongoose Schemas
for the file and folder objects.

uploadMiddleware creates a multer diskStorage object with the destination, using path.join to get the absolute path no matter where we are
running our program from. The file name on the actual server is a uuid so that users can upload files with the same name and no collisions will
happen. We also also create a fileFilter so that we can control what kind of files can be uploaded. Finally we combine these two methods
in an upload method, and also adding a file size restriction.

fileController allows the user to upload, get, download, and delete files. Overall its pretty simple, the controller doesnt actually upload
anything, that is the middleware's job, our upload file method in the controller simply creates a cooresponding object in our database
for each file upload. downloadFile retrives the file, verfies that the person requesting actually owns the file, then sends the file to the 
client via res.download(). deleteFile does a very similar process, verifying the client's id, then deleting the file from the drive, then 
deleting the mongoDB object.

fileRoutes simply adds endpoints to each of the controller's functions, and ties the upload middleware to the controller, and protects all of
it with our authMiddleware. 

    We also had to add a little if statement in our server.js file to make sure that our uploads folder actually exsists.

In terms of bugs today it wasn't too bad, I had an issue where I created the fileModel with the parameters parentFolderID, capital I and D, but
in the fileController was sending parentFolderId, capital I lowercase d.

# 5/11/2026

Today we added implementation for folders! I am handling folders such that they do not exsist on the
actual drive at all, but rather only exsist on the database. Each file and folder object has a 
parentFolderId field that will only be referenced to when rendering my dashboard on the frontend.

On top of folders we also added the ability to rename and move both files and folders. 

The implementation was pretty straight forward as most of it I was able to copy-paste from the
file controller and refactor it. The most difficult part of the folder implementation was the
delete function. Since deleting a folder with things in it should delete all the things inside it,
sub folders and sub files, this is fairly straight forward with recursion. Simply fetch all sub
folders of the folder you're deleting then recurse into those folders first. When you get to a folder that doesn't have any sub folders you can then check the folder for files, delete the files,
the delete the folder. This chain then works its way back up the recursion. 

After creating a folder router I tested each endpoint, spent about half an hour troubleshooting the 
delete function wasn't deleting any subfolders or files until I realized it was a simple typo,
I was searching by parentId not parentFolderId. After fixing that issue it all worked. I believe 
with folders done I have successfully finished my backend and can now work on building my frontend!

# 7/20/2026

Used Claude Code for the first time today, I didn't realize how powerful of a tool that it really is. Used it to finish up most of my dashboard today,
not only did it catch a couple errors I had made, but then after it added the features I requested, went back a verified they all worked by opening it on my 
browser and manipulating it automatically. Crazy stuff! I had only really ever used AI to find errors in my code previously so using it to create whole features is a 
brand new world to me. With the help of Claude we added rename/delete to files, previews and dowloads, and fixed a navigation bug. I hope to start work on the setting menu next!