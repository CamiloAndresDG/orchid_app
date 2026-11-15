// Sin "use client": lo importa layout.tsx (componente de servidor) para incrustarlo en <head>.

/** Script que corre en <head> antes de pintar: fija idioma y tema para que no haya parpadeo. */
export const BOOT_SCRIPT = `(function(){try{var d=document.documentElement,l=null,t=null;try{l=localStorage.getItem("lang");t=localStorage.getItem("orchid.theme")}catch(e){}if(l!=="es"&&l!=="en"){var n=(navigator.languages&&navigator.languages[0])||navigator.language||"es";l=n.toLowerCase().indexOf("es")===0?"es":"en"}d.lang=l;if(t!=="light"&&t!=="dark"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.setAttribute("data-theme",t)}catch(e){}})()`;
