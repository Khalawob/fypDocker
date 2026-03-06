import { BrowserRouter, Routes, Route } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import SetsList from "./pages/SetsList";
import SetPage from "./pages/SetPage";

function Home() {
  return (
    <div>
      <h1>Flashcard App</h1>
      <p>Welcome to your practice system</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/sets" element={<SetsList />} />
        <Route path="/sets/:setId" element={<SetPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
