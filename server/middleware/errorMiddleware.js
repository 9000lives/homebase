//Error Middleware from Professor Bibek Upadhayay, temporary?

// by default express sends back hard to understand html error 
// we want that error in clean json format 
// so we are building error middleware

// Define the error handler 
//  it takes 4 parameters (err, req, res, next),
//  which is how Express recognizes it as an ERROR middleware, not a regular one
const errorHandler = (err, req, res, next) =>{

    // Check if a status code was already set on the response (e.g., 400, 404 from a controller) 
    //  if not, default to 500 (Internal Server Error)
    const statusCode  = res.statusCode ? res.statusCode : 500 ; 

    // Set the HTTP status code on the response 
    //  this tells the client what kind of error occurred (400 = bad request, 404 = not found, 500 = server error)
    res.status(statusCode)

    // Send a JSON response with the error details 
    //  much cleaner than Express's default HTML error page
    res.json(
        {
            // The human-readable error message from the thrown Error object (e.g., "Note not found")
            message: err.message,

            // The stack trace shows exactly where the error happened 
            //  only include it in development for debugging, 
            // hide it in production for security (exposing file paths and line numbers is a risk)
            stack: process.env.NODE_ENV === 'production' ? null : err.stack
        }
    )
}

// Export as an object using shorthand { errorHandler }
//  this is why we destructure it in server.js with const { errorHandler } = require(...)
module.exports={
    errorHandler
}