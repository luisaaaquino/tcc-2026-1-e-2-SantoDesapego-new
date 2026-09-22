import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ScrollToTop      from './componentes/ScrollToTop';
import Home             from './pages/Home';
import Login            from './pages/Login';
import Cadastro         from './pages/Cadastro';
import Perfil           from './pages/Perfil';
import PerfilPublico    from './pages/PerfilPublico';
import Anunciar         from './pages/Anunciar';
import Explorar         from './pages/Explorar';
import Sobre            from './pages/Sobre';
import Indique          from './pages/Indique';
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
      <ScrollToTop />
      <Routes>
        <Route path="/"                  element={<Home />}             />
        <Route path="/login"             element={<Login />}            />
        <Route path="/cadastro"          element={<Cadastro />}         />
        <Route path="/perfil"            element={<Perfil />}           />
        <Route path="/usuario/:id"       element={<PerfilPublico />}    />
        <Route path="/anunciar"          element={<Anunciar />}         />
        <Route path="/anunciar/:id"      element={<Anunciar />}         />
        <Route path="/explorar"          element={<Explorar />}         />
        <Route path="/sobre"             element={<Sobre />}            />
        <Route path="/indique"           element={<Indique />}          />
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