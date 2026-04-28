export default function GuidaUtilizzo() {
  return (
    <div className="guida-container">
      <div className="page-header">
        <h1 className="page-title">Guida all'Utilizzo</h1>
        <p className="page-subtitle">
          Come funziona Smart Investor e come interpretare i dati.
        </p>
      </div>

      <div className="guida-section">
        <h2>Come funziona</h2>
        <p>
          Smart Investor analizza i <strong>filing 13F</strong> depositati presso la SEC (Securities and Exchange Commission)
          dai principali investitori istituzionali. Ogni trimestre, i fondi con oltre 100 milioni di dollari in gestione
          sono obbligati a dichiarare le loro posizioni long su titoli quotati negli Stati Uniti.
        </p>
        <p>
          Il sistema raccoglie questi dati, li normalizza e li analizza per identificare pattern di consenso,
          convinzione e momentum tra i migliori investitori al mondo. A ogni titolo viene assegnato un punteggio
          complessivo basato su queste metriche.
        </p>
      </div>

      <div className="guida-section">
        <h2>Metriche</h2>
        <div className="guida-metric-grid">
          <div className="guida-metric-card">
            <strong>Overall Score (0-100)</strong>
            <p>Punteggio complessivo che combina consenso, convinzione, nuove posizioni e momentum. Piu' alto = titolo piu' interessante secondo i super investitori.</p>
          </div>
          <div className="guida-metric-card">
            <strong>Consensus Score</strong>
            <p>Misura quanti investitori top detengono il titolo, ponderato per la qualita' dell'investitore. Un alto consenso indica accordo tra piu' gestori.</p>
          </div>
          <div className="guida-metric-card">
            <strong>Conviction Score</strong>
            <p>Peso medio del titolo nei portafogli di chi lo detiene. Un valore alto indica che gli investitori hanno messo una quota significativa del loro portafoglio su questo titolo.</p>
          </div>
          <div className="guida-metric-card">
            <strong>Momentum Score</strong>
            <p>Allineamento tra il trend di prezzo del titolo e i pattern di acquisto/vendita degli investitori. Alto = il momentum di mercato conferma le scelte degli investitori.</p>
          </div>
          <div className="guida-metric-card">
            <strong>New Position Bonus</strong>
            <p>Bonus assegnato quando 3 o piu' investitori aprono una nuova posizione sullo stesso titolo nello stesso trimestre. E' un segnale di cluster particolarmente forte.</p>
          </div>
        </div>
      </div>

      <div className="guida-section">
        <h2>Come leggere la Dashboard</h2>
        <ul>
          <li><strong>Dashboard:</strong> panoramica generale con le statistiche principali, i top 10 titoli, segnali di vendita, cluster di nuove posizioni e distribuzione settoriale.</li>
          <li><strong>Segnali Compra/Vendi:</strong> lista esplicita dei titoli da comprare (alto punteggio e consenso) e da vendere (investitori in uscita).</li>
          <li><strong>Top Holdings:</strong> tabella completa di tutti i titoli con filtri, ordinamento e dettaglio dei detentori. Clicca su una riga per espandere.</li>
          <li><strong>Consensus Picks:</strong> classifica per punteggio di consenso. Mostra la percentuale di accordo tra gli investitori monitorati.</li>
          <li><strong>Nuove Posizioni:</strong> titoli su cui gli investitori hanno aperto nuove posizioni in questo trimestre. I cluster (3+ investitori) sono segnali forti.</li>
          <li><strong>Posizioni Chiuse:</strong> titoli venduti completamente o ridotti significativamente. Segnali di potenziale debolezza.</li>
          <li><strong>Ranking Convinzione:</strong> classifica per peso percentuale in portafoglio. Mostra le posizioni con la convinzione piu' alta.</li>
          <li><strong>Dettaglio Investitori:</strong> profilo completo di ciascun investitore con portafoglio, movimenti e statistiche.</li>
        </ul>
      </div>

      <div className="guida-section">
        <h2>Segnali di acquisto</h2>
        <p>Un buon segnale di acquisto si verifica quando:</p>
        <ul>
          <li><strong>Alto consenso:</strong> molti investitori top detengono il titolo (consensus score elevato)</li>
          <li><strong>Alta convinzione:</strong> il titolo rappresenta una quota significativa dei portafogli (conviction score elevato)</li>
          <li><strong>Nuove posizioni cluster:</strong> 3+ investitori aprono una nuova posizione contemporaneamente</li>
          <li><strong>Momentum positivo:</strong> il prezzo del titolo e' in trend con gli acquisti istituzionali</li>
          <li><strong>Aumento posizioni:</strong> gli investitori esistenti stanno comprando di piu'</li>
        </ul>
      </div>

      <div className="guida-section">
        <h2>Segnali di vendita</h2>
        <p>Un segnale di vendita si genera quando:</p>
        <ul>
          <li><strong>Uscite multiple:</strong> diversi investitori chiudono completamente la posizione nello stesso trimestre</li>
          <li><strong>Riduzioni significative:</strong> investitori riducono le azioni detenute in modo consistente</li>
          <li><strong>Calo del consenso:</strong> il numero di detentori diminuisce nel tempo</li>
          <li><strong>Score basso:</strong> il punteggio complessivo e' significativamente sotto la media</li>
        </ul>
      </div>

      <div className="guida-section">
        <h2>Frequenza aggiornamento</h2>
        <p>
          I dati vengono aggiornati <strong>trimestralmente</strong>, in corrispondenza con le scadenze dei filing 13F.
          La SEC richiede che i filing vengano depositati entro 45 giorni dalla fine del trimestre:
        </p>
        <ul>
          <li><strong>Q1</strong> (gen-mar): filing entro il 15 maggio</li>
          <li><strong>Q2</strong> (apr-giu): filing entro il 14 agosto</li>
          <li><strong>Q3</strong> (lug-set): filing entro il 14 novembre</li>
          <li><strong>Q4</strong> (ott-dic): filing entro il 14 febbraio</li>
        </ul>
      </div>

      <div className="guida-section">
        <h2>Limitazioni</h2>
        <ul>
          <li><strong>Ritardo di 45 giorni:</strong> i dati 13F hanno un ritardo intrinseco. Le posizioni potrebbero essere gia' cambiate rispetto a quanto dichiarato.</li>
          <li><strong>Solo posizioni long:</strong> i filing 13F mostrano solo le posizioni long (acquisto). Non includono posizioni short, opzioni put o altre coperture.</li>
          <li><strong>No opzioni/derivati:</strong> le strategie complesse con opzioni non sono visibili nei 13F standard.</li>
          <li><strong>Solo mercato USA:</strong> i 13F coprono solo titoli quotati nelle borse statunitensi.</li>
          <li><strong>Soglia minima:</strong> solo i fondi con oltre $100M in gestione sono obbligati al deposito 13F.</li>
          <li><strong>Snapshot trimestrali:</strong> i dati rappresentano la situazione alla fine del trimestre. I movimenti infratrimestrali non sono visibili.</li>
        </ul>
      </div>
    </div>
  );
}
