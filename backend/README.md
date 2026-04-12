

# Online Test Platform  backend


### Stack

- Node.js
- Express.js
- MongoDB + Mongoose
- JWT auth + role-based middleware
- CommonJS modules

### Project Structure

src/

- app.js
- server.js
- config/
  - db.js
- controllers/
  - authController.js
  - healthController.js
  - studentController.js
  - teacherController.js
- middlewares/
  - authMiddleware.js
  - roleMiddleware.js
  - validateRequest.js
  - errorHandler.js
  - notFound.js
- models/
  - user.model.js
  - test.model.js
  - testSlot.model.js
  - testQuestionSet.model.js
  - question.model.js
  - questionOption.model.js
  - testCandidate.model.js
  - testAttempt.model.js
  - attemptAnswer.model.js
  - testResult.model.js
  - activityLog.model.js
  - index.js
- routes/
  - authRoutes.js
  - teacherRoutes.js
  - studentRoutes.js
  - index.js
- services/
  - authService.js
  - teacherService.js
  - studentService.js
  - resultService.js
  - index.js
- scripts/
  - seedUsers.js
- utils/
  - apiError.js
  - apiResponse.js
  - asyncHandler.js
  - enums.js
  - pagination.js
  - slug.js
- validators/
  - authValidators.js
  - teacherValidators.js
  - studentValidators.js

### Environment Variables

Create .env in backend root:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/ibos
DB_NAME=ibos
JWT_SECRET=replace-with-strong-secret
JWT_EXPIRES_IN=1d
SYNC_INDEXES=true
AUTO_CHECK_TEXT_ANSWER=false
```

### Scripts

- npm run dev
- npm start
- npm run seed:users

### API Base URL

http://localhost:5000/api

### Key Endpoints

Auth:

- POST /auth/login
- GET /auth/me
- POST /auth/seed-register (development only)

Teacher:

- POST /teacher/tests
- GET /teacher/tests
- GET /teacher/tests/:testId
- PATCH /teacher/tests/:testId
- POST /teacher/tests/:testId/slots
- POST /teacher/tests/:testId/question-sets
- POST /teacher/tests/:testId/questions
- PATCH /teacher/questions/:questionId
- DELETE /teacher/questions/:questionId
- GET /teacher/tests/:testId/questions
- POST /teacher/questions/:questionId/options
- PATCH /teacher/questions/:questionId/options/:optionId
- POST /teacher/tests/:testId/candidates/assign
- GET /teacher/tests/:testId/candidates
- POST /teacher/tests/:testId/publish
- GET /teacher/tests/:testId/metrics
- GET /teacher/tests/:testId/text-answer-reviews
- POST /teacher/attempt-answers/:answerId/review

Student:

- GET /student/tests
- GET /student/dashboard/metrics
- GET /student/tests/:testId
- POST /student/tests/:testId/start
- GET /student/attempts/:attemptId/current-question
- POST /student/attempts/:attemptId/answer
- POST /student/attempts/:attemptId/skip
- POST /student/attempts/:attemptId/submit
- GET /student/attempts/:attemptId/result

### Running Locally

1. npm install
2. Add .env values
3. Start MongoDB
4. Optional seed users: npm run seed:users
5. Start API: npm run dev


