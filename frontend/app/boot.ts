// No "use client": layout.tsx (a server component) imports it to inline it in <head>.

/** Script that runs in <head> before painting: sets language and theme so nothing flickers. */
export const BOOT_SCRIPT = `(function(){try{var d=document.documentElement,l=null,t=null;try{l=localStorage.getItem("lang");t=localStorage.getItem("orchid.theme")}catch(e){}if(l!=="es"&&l!=="en"){var n=(navigator.languages&&navigator.languages[0])||navigator.language||"es";l=n.toLowerCase().indexOf("es")===0?"es":"en"}d.lang=l;if(t!=="light"&&t!=="dark"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.setAttribute("data-theme",t)}catch(e){}})()`;
