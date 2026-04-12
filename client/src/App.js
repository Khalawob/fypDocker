import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { BackgroundProvider } from "./context/BackgroundContext";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Sets from "./pages/Sets";
import Practice from "./pages/Practice";
import CreateSet from "./pages/CreateSet";
import SetDetails from "./pages/SetDetails";
import EditFlashcard from "./pages/EditFlashcard";
import AddFlashcard from "./pages/AddFlashcard";
import EditSet from "./pages/EditSet";
import Profile from "./pages/Profile";
import About from "./pages/About";
import Calibration from "./pages/Calibration";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import ImportDocument from "./pages/ImportDocument";
import MultiplayerHome from "./pages/MultiplayerHome";
import CreateMultiplayerRoom from "./pages/CreateMultiplayerRoom";
import JoinMultiplayerRoom from "./pages/JoinMultiplayerRoom";
import MultiplayerRoom from "./pages/MultiplayerRoom";

function App() {
  return (
    <BackgroundProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/sets" element={<Sets />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/sets/create" element={<CreateSet />} />
          <Route path="/sets/:setId" element={<SetDetails />} />
          <Route path="/sets/:setId/add-flashcard" element={<AddFlashcard />} />
          <Route path="/sets/:setId/flashcards/:flashcardId/edit" element={<EditFlashcard />} />
          <Route path="/sets/:setId/edit" element={<EditSet />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/about" element={<About />} />
          <Route path="/calibration" element={<Calibration />} />
          <Route path="/sets/:setId/import-document" element={<ImportDocument />} />
          <Route path="/multiplayer" element={<MultiplayerHome />} />
          <Route path="/multiplayer/create" element={<CreateMultiplayerRoom />} />
          <Route path="/multiplayer/join" element={<JoinMultiplayerRoom />} />
          <Route path="/multiplayer/join/:joinCode" element={<JoinMultiplayerRoom />} />
          <Route path="/multiplayer/room/:joinCode" element={<MultiplayerRoom />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </BackgroundProvider>
  );
}

export default App;