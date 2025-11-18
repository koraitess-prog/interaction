// script.js - קוד סופי משולב: מחזור אובייקטים (עם תיקוני יציבות ואיפוס)

// הגדרות עיקריות
const MAX_ZOOM = 10;
const MIN_ZOOM = 0.8; // זום-אאוט מינימלי (80%) - ההגדרה הנכונה למצב התחלתי
const RUST_THRESHOLD = [1.05, 2, 3.5]; 
const RUST_HOLD_DELAY_MS = 2000; 
const GLITCH_DURATION_MS = 500; 
const MIN_PAN_ZOOM = 1.05; 
const NUM_OBJECTS = 4;

// אלמנטים
const imageContainer = document.getElementById('image-container');
const glitchOverlay = document.getElementById('glitch-overlay');
const objectGroups = document.querySelectorAll('.object-group');

// מצב גלובלי
let currentZoom = MIN_ZOOM; // אתחול למצב המינימלי
let currentObjectIndex = 0; 
let isGlitching = false;
let rustHoldTimeoutId = null;
let glitchTimeoutId = null;
let maxRustLevel = 0;

// --- משתנים לגרירת עכבר וקיזוז מגע ---
let isDragging = false; 
let startX = 0; 
let startY = 0;
let currentTranslateX = 0; 
let currentTranslateY = 0; 
let previousTranslateX = 0; 
let previousTranslateY = 0;

// --- משתנים לזום דינמי (Pinch) ---
let initialDistance = 0;
let isPinching = false;
let initialFocusPointX = 0; 
let initialFocusPointY = 0;

// ------------------------------------------
// פונקציות עזר למחזור אובייקטים
// ------------------------------------------

// מחזירה את השכבות של האובייקט הפעיל
function getCurrentObjectLayers() {
    const activeGroup = objectGroups[currentObjectIndex];
    const cleanLayer = activeGroup.querySelector('.clean');
    // נשתמש ב-querySelectorAll ומערך כדי לוודא סדר נכון (rust1, rust2, rust3)
    const rustLayers = [
        activeGroup.querySelector('.rust1'),
        activeGroup.querySelector('.rust2'),
        activeGroup.querySelector('.rust3')
    ];
    return { cleanLayer, rustLayers };
}

// מחליפה לאובייקט הבא
function cycleToNextObject() {
    // 0. ודא שהאובייקט היוצא נעלם לגמרי (תיקון יציבות)
    const { cleanLayer: oldClean, rustLayers: oldRust } = getCurrentObjectLayers();
    oldRust.forEach(layer => layer.style.opacity = 0);
    oldClean.style.opacity = 0;
    
    // 1. כבה את הקבוצה הנוכחית
    objectGroups[currentObjectIndex].classList.remove('active');
    
    // 2. עדכן את האינדקס במחזוריות (0 -> 1 -> 2 -> 3 -> 0)
    currentObjectIndex = (currentObjectIndex + 1) % NUM_OBJECTS;
    
    // 3. הפעל את הקבוצה הבאה
    objectGroups[currentObjectIndex].classList.add('active');
    
    // 4. איפוס מצב החלודה עבור האובייקט החדש
    maxRustLevel = 0;
}

// ------------------------------------------
// פונקציות ליבה
// ------------------------------------------

function updateImageTransform() {
    imageContainer.style.transformOrigin = '50% 50%'; 
    imageContainer.style.transform = 
        `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentZoom})`;
}

function updateRustLayers() {
    if (rustHoldTimeoutId || isGlitching) return;
    
    const { cleanLayer, rustLayers } = getCurrentObjectLayers();

    let currentRustVisible = false;
    let currentMaxRustIndex = -1;

    // קובע את רמת החלודה המקסימלית הרצויה לפי הזום
    rustLayers.forEach((layer, index) => {
        if (currentZoom >= RUST_THRESHOLD[index]) {
            currentMaxRustIndex = index;
        }
    });

    // שומר את רמת החלודה הגבוהה ביותר שנחשפה אי פעם
    maxRustLevel = Math.max(maxRustLevel, currentMaxRustIndex + 1);

    // אם הזום מתחת לסף החלודה (MIN_ZOOM עד RUST_THRESHOLD[0]), הראה נקי.
    if (currentZoom < RUST_THRESHOLD[0]) {
        rustLayers.forEach(layer => layer.style.opacity = 0);
        cleanLayer.style.opacity = 1;
    } else {
        // חושף את השכבות עד לרמה המקסימלית שהושגה
        for (let i = 0; i < rustLayers.length; i++) {
            if (i < maxRustLevel) {
                rustLayers[i].style.opacity = 1;
                currentRustVisible = true;
            } else {
                rustLayers[i].style.opacity = 0;
            }
        }
        cleanLayer.style.opacity = currentRustVisible ? 0 : 1;
    }
}

function activateGlitchAndReset() {
    if (isGlitching) return;
    isGlitching = true;
    glitchOverlay.classList.add('glitching'); 

    glitchTimeoutId = setTimeout(() => {
        glitchOverlay.classList.remove('glitching');
        isGlitching = false;
        glitchTimeoutId = null;

        // 1. איפוס טרנספורמציה
        currentZoom = MIN_ZOOM; // **תיקון 1:** איפוס לזום ההתחלתי הנכון (0.8)
        currentTranslateX = 0;
        currentTranslateY = 0;
        previousTranslateX = 0;
        previousTranslateY = 0;
        updateImageTransform();
        
        // 2. מעבר לאובייקט הבא בסדרה
        cycleToNextObject();
        
        // 3. איפוס חזותי של האובייקט החדש (למצב נקי)
        const { cleanLayer, rustLayers } = getCurrentObjectLayers();
        rustLayers.forEach(layer => layer.style.opacity = 0);
        cleanLayer.style.opacity = 1; // ודא שהוא מופיע
        
    }, GLITCH_DURATION_MS);
}

function performZoom(delta) {
    // לוגיקת איפוס טיימר/גליץ' בעת תנועה
    if (rustHoldTimeoutId) {
        clearTimeout(rustHoldTimeoutId);
        rustHoldTimeoutId = null;
    }
    
    // טיפול בביטול גליץ'
    if (glitchTimeoutId) {
        clearTimeout(glitchTimeoutId);
        glitchTimeoutId = null;
        glitchOverlay.classList.remove('glitching');
        isGlitching = false;
        
        // מעבר מיידי לאובייקט הבא אם הגליץ' נקטע
        currentZoom = MIN_ZOOM; // **תיקון 1:** איפוס לזום ההתחלתי הנכון (0.8)
        currentTranslateX = 0; currentTranslateY = 0;
        previousTranslateX = 0; previousTranslateY = 0;
        updateImageTransform();
        cycleToNextObject(); 
        maxRustLevel = 0; 
        const { cleanLayer, rustLayers } = getCurrentObjectLayers();
        rustLayers.forEach(layer => layer.style.opacity = 0);
        cleanLayer.style.opacity = 1;
        return;
    }
    
    if (isGlitching) return;

    let newZoom = currentZoom + delta;
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)); // ודא שהזום לא יורד מ-MIN_ZOOM
    
    if (newZoom <= MIN_ZOOM) { 
        currentTranslateX = 0; currentTranslateY = 0;
        previousTranslateX = 0; previousTranslateY = 0;
    }

    currentZoom = newZoom;
    updateImageTransform();
    updateRustLayers();

    // לוגיקת המתנה של 2 שניות על החלודה המלאה
    if (currentZoom <= MIN_ZOOM && delta < 0) {
        const { cleanLayer, rustLayers } = getCurrentObjectLayers();
        // הצג חלודה מלאה (איתות)
        rustLayers.forEach(layer => layer.style.opacity = 0);
        if (rustLayers.length > 2) { 
            rustLayers[2].style.opacity = 1; 
        }
        cleanLayer.style.opacity = 0;
        
        if (!rustHoldTimeoutId) {
             rustHoldTimeoutId = setTimeout(() => {
                 rustHoldTimeoutId = null;
                 activateGlitchAndReset();
             }, RUST_HOLD_DELAY_MS);
        }
    }
}

// ------------------------------------------
// לוגיקת מגע ועכבר (החלק המורכב והיציב)
// ------------------------------------------
// פונקציות העזר לחישובי מגע... (נשארות כפי שהן)
function getDistance(t1, t2) {
    return Math.sqrt(
        Math.pow(t2.clientX - t1.clientX, 2) +
        Math.pow(t2.clientY - t1.clientY, 2)
    );
}

function getCenter(t1, t2) {
    return {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
    };
}

function getRelativePosition(clientX, clientY) {
    const rect = imageContainer.getBoundingClientRect();
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}
// ...
// טיפול בארועי עכבר וגלגלת (נשארים כפי שהם)
function handleWheel(event) {
    event.preventDefault();
    const delta = -event.deltaY * 0.005;
    currentTranslateX = previousTranslateX;
    currentTranslateY = previousTranslateY;
    performZoom(delta);
}

function handleMouseDown(event) {
    if (isGlitching || event.button !== 0 || isPinching) return; 
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    previousTranslateX = currentTranslateX; 
    previousTranslateY = currentTranslateY;
    imageContainer.style.cursor = 'grabbing';
}

function handleMouseMove(event) {
    if (!isDragging || isGlitching || isPinching) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (currentZoom > MIN_PAN_ZOOM) { 
        currentTranslateX = previousTranslateX + dx;
        currentTranslateY = previousTranslateY + dy;
        updateImageTransform();
    }
}

function handleMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    previousTranslateX = currentTranslateX; 
    previousTranslateY = currentTranslateY;
    imageContainer.style.cursor = 'grab';
}
// טיפול בארועי מגע (עם תיקוני יציבות)
function handleTouchStart(event) {
    if (rustHoldTimeoutId || isGlitching) {
        if (rustHoldTimeoutId) clearTimeout(rustHoldTimeoutId);
        if (glitchTimeoutId) clearTimeout(glitchTimeoutId);
        rustHoldTimeoutId = null;
        glitchTimeoutId = null;
        glitchOverlay.classList.remove('glitching');
        isGlitching = false;
        
        // מעבר מיידי לאובייקט הבא אם הטיימר/גליץ' נקטע
        currentZoom = MIN_ZOOM; // **תיקון 1:** איפוס לזום ההתחלתי הנכון (0.8)
        currentTranslateX = 0; currentTranslateY = 0;
        previousTranslateX = 0; previousTranslateY = 0;
        updateImageTransform();
        cycleToNextObject(); 
        maxRustLevel = 0; 
        const { cleanLayer, rustLayers } = getCurrentObjectLayers();
        rustLayers.forEach(layer => layer.style.opacity = 0);
        cleanLayer.style.opacity = 1;
        return;
    }
    
    isDragging = false;
    isPinching = false;
    
    if (event.touches.length === 2) {
        isPinching = true;
        
        initialDistance = getDistance(event.touches[0], event.touches[1]);
        const center = getCenter(event.touches[0], event.touches[1]);
        const relativeCenter = getRelativePosition(center.x, center.y);

        initialFocusPointX = relativeCenter.x;
        initialFocusPointY = relativeCenter.y;

        previousTranslateX = currentTranslateX;
        previousTranslateY = currentTranslateY;
    } else if (event.touches.length === 1 && currentZoom >= MIN_PAN_ZOOM) {
        isDragging = true;
        
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        
        previousTranslateX = currentTranslateX;
        previousTranslateY = currentTranslateY;
    }
}

function handleTouchMove(event) {
    if (isGlitching) return;
    event.preventDefault(); 
    
    if (isPinching && event.touches.length === 2) {
        
        const newDistance = getDistance(event.touches[0], event.touches[1]);
        const scaleFactor = newDistance / initialDistance;

        const oldZoom = currentZoom;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * scaleFactor)); // **תיקון:** שימוש ב-MIN_ZOOM
        
        if (newZoom === oldZoom) return;

        // חישוב קיזוז
        const containerRect = imageContainer.getBoundingClientRect();
        const halfWidth = containerRect.width / 2;
        const halfHeight = containerRect.height / 2;
        
        const focusOffsetX = initialFocusPointX - halfWidth;
        const focusOffsetY = initialFocusPointY - halfHeight;

        const compensateX = focusOffsetX * (newZoom - oldZoom);
        const compensateY = focusOffsetY * (newZoom - oldZoom);

        currentTranslateX = previousTranslateX - compensateX;
        currentTranslateY = previousTranslateY - compensateY;
        
        currentZoom = newZoom;
        updateImageTransform();
        updateRustLayers(); 

        // לוגיקת חלודה/גליץ'
        if (currentZoom <= MIN_ZOOM) { 
            const { cleanLayer, rustLayers } = getCurrentObjectLayers();
            rustLayers.forEach(layer => layer.style.opacity = 0);
            if (rustLayers.length > 2) { 
                rustLayers[2].style.opacity = 1; 
            }
            cleanLayer.style.opacity = 0;

            if (!rustHoldTimeoutId) {
                 rustHoldTimeoutId = setTimeout(() => {
                     rustHoldTimeoutId = null;
                     activateGlitchAndReset();
                 }, RUST_HOLD_DELAY_MS);
            }
        } else {
            if (rustHoldTimeoutId) {
                clearTimeout(rustHoldTimeoutId);
                rustHoldTimeoutId = null;
            }
        }
        
        previousTranslateX = currentTranslateX;
        previousTranslateY = currentTranslateY;
        initialDistance = newDistance;

    } else if (isDragging && event.touches.length === 1) {
        
        const dx = event.touches[0].clientX - startX;
        const dy = event.touches[0].clientY - startY;

        currentTranslateX = previousTranslateX + dx;
        currentTranslateY = previousTranslateY + dy;
        updateImageTransform();
    }
}

function handleTouchEnd() {
    if (isPinching || isDragging) {
        previousTranslateX = currentTranslateX; 
        previousTranslateY = currentTranslateY;
    }
    
    isPinching = false;
    isDragging = false; 

    initialFocusPointX = 0; 
    initialFocusPointY = 0;
    
    // מטפל בהמתנת הגליץ' לאחר סיום מגע
    if (currentZoom <= MIN_ZOOM && !rustHoldTimeoutId && !isGlitching) { 
         const { cleanLayer, rustLayers } = getCurrentObjectLayers();
         rustLayers.forEach(layer => layer.style.opacity = 0);
         if (rustLayers.length > 2) { 
             rustLayers[2].style.opacity = 1; 
         }
         cleanLayer.style.opacity = 0;
         
         rustHoldTimeoutId = setTimeout(() => {
             rustHoldTimeoutId = null;
             activateGlitchAndReset();
         }, RUST_HOLD_DELAY_MS);
    }
}

// ------------------------------------------
// חיבור מאזיני אירועים ואתחול
// ------------------------------------------

window.addEventListener('wheel', handleWheel, { passive: false });
imageContainer.addEventListener('mousedown', handleMouseDown);
window.addEventListener('mousemove', handleMouseMove);
window.addEventListener('mouseup', handleMouseUp); 

// **תיקון 3:** שימוש בהגדרות passive הנכונות ליציבות מוחלטת במובייל
window.addEventListener('touchstart', handleTouchStart, { passive: true });  // passive: true למניעת עיכוב
window.addEventListener('touchmove', handleTouchMove, { passive: false }); // passive: false למניעת גלילה נייטיבית
window.addEventListener('touchend', handleTouchEnd, { passive: true });    // passive: true למניעת עיכוב


// אתחול: התחלה במצב מינימלי (0.8)
updateImageTransform();
objectGroups[currentObjectIndex].classList.add('active');
const { cleanLayer, rustLayers } = getCurrentObjectLayers();
cleanLayer.style.opacity = 1;
rustLayers.forEach(layer => layer.style.opacity = 0);