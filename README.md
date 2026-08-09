### TaxWise helps people ask questions about tax documents and official tax information and can get up to date information.
 
#### TaxWise AI is a source-aware Indian tax research assistant built with Next.js, TypeScript, Supabase/PostgreSQL, and Groq’s Llama 3.3 70B. It helps users understand uploaded tax PDFs, explore a curated library of official tax documents, calculate indicative tax liability, and verify time-sensitive information using trusted government sources. The application is intended for education and research, not personal tax, legal, or financial advice.

#### The system uses Retrieval-Augmented Generation (RAG) so that answers can be grounded in documents rather than relying only on an LLM’s built-in knowledge. PDFs are processed page by page, split into overlapping chunks, indexed in PostgreSQL, and linked to page metadata. When a question is asked, TaxWise retrieves relevant passages and supplies them to the language model, which produces an answer with traceable citations.

####  TaxWise supports hybrid retrieval by combining PostgreSQL full-text search with pgvector semantic search. Lexical and vector candidates are merged using Reciprocal Rank Fusion (RRF), then optionally reranked with a multilingual  cross-encoder before the best five passages are used for generation. This approach improves both exact-term  matching, such as tax sections and form numbers, and meaning-based matching when a user’s language differs from the wording in a document.

####  The application maintains two retrieval scopes. Private uploads are isolated to the user session and are queried explicitly with the syntax @ question /, preventing accidental use of sensitive documents. Normal questions search a shared, admin-curated library of official CBDT circulars, Finance Acts, rules, notifications, and ITR instructions.  Shared-library answers cite the document title, original official URL, publication date, and relevant page number.

####  TaxWise also includes a protected evaluation workflow for measuring Recall@5, answer faithfulness, and answer relevance. This makes it possible to compare lexical and hybrid retrieval experimentally and report measured improvements rather than assumed quality gains.

<table>
  <tr>
    <td><img src="./images/Screenshot 2026-08-09 at 10.06.19 PM.png" width="300" alt="Screenshot 1"></td>
    <td><img src="./images/Screenshot 2026-08-09 at 10.06.39 PM.png" width="300" alt="Screenshot 2"></td>
    <td><img src="./images/Screenshot 2026-08-09 at 10.06.48 PM.png" width="300" alt="Screenshot 2"></td>
  </tr>
</table>
