import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home             from './pages/Home';
import Login            from './pages/Login';
import Cadastro         from './pages/Cadastro';
import Perfil           from './pages/Perfil';
import Anunciar         from './pages/Anunciar';
import Explorar         from './pages/Explorar';
import Sobre            from './pages/Sobre';
import Anuncio          from './pages/Anuncio';
import Mensagens        from './pages/Mensagens';
import Checkout         from './pages/Checkout';
import CompraRealizada  from './pages/CompraRealizada';
import Admin            from './pages/Admin';
import CentralAjuda     from './pages/CentralAjuda';
import EsqueciSenha     from './pages/EsqueciSenha';
import RedefinirSenha   from './pages/RedefinirSenha';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                  element={<Home />}             />
        <Route path="/login"             element={<Login />}            />
        <Route path="/cadastro"          element={<Cadastro />}         />
        <Route path="/perfil"            element={<Perfil />}           />
        <Route path="/anunciar"          element={<Anunciar />}         />
        <Route path="/explorar"          element={<Explorar />}         />
        <Route path="/sobre"             element={<Sobre />}            />
        <Route path="/anuncio/:id"       element={<Anuncio />}          />
        <Route path="/mensagens"         element={<Mensagens />}        />
        <Route path="/checkout/:id"      element={<Checkout />}         />
        <Route path="/compra-realizada"  element={<CompraRealizada />}  />
        <Route path="/admin"             element={<Admin />}            />
        <Route path="/central-ajuda"     element={<CentralAjuda />}     />
        <Route path="/esqueci-senha"     element={<EsqueciSenha />}     />
        <Route path="/redefinir-senha"   element={<RedefinirSenha />}   />
      </Routes>
    </BrowserRouter>
  );
}

export default App;