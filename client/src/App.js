import { BrowserRouter, Routes, Route } from "react-router-dom";
import Register from "./pages/Register";

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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
