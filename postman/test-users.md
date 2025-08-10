# Test Kullanıcıları - Role Based Testing

## 🧪 Test için Kullanılacak Hesaplar

| **Username** | **Password** | **Rol** | **Role Level** | **Test Amacı** |
|--------------|--------------|---------|----------------|----------------|
| `baris.gullu` | `bar123` | VIEWER | 30 | ✅ **Mevcut** - Temel erişim testi |
| `admin.test` | `admin123` | ADMIN | 95 | ❓ Gerekirse oluşturun |
| `mudur.test` | `mudur123` | GENEL_MUDUR | 100 | ❓ Gerekirse oluşturun |
| `personel.test` | `pers123` | PERSONEL | 30 | ❓ Gerekirse oluşturun |

## 📊 Beklenen Test Sonuçları

### **VIEWER (baris.gullu) - Level 30:**
- ✅ **Erişebilir:** teslimatTurleri, kategoriler
- ❌ **Erişemez:** subeler, cariler, odemeYontemleri, urunler

### **PERSONEL - Level 30:**  
- ✅ **Erişebilir:** teslimatTurleri, kategoriler
- ❌ **Erişemez:** subeler (level 50+ gerekli)

### **ADMIN - Level 95:**
- ✅ **Erişebilir:** Hemen hemen her şey
- ❌ **Sadece kısıtlı:** PII data (level 100 gerekli olabilir)

### **GENEL_MUDUR - Level 100:**
- ✅ **Erişebilir:** **HER ŞEY** (tam yetki)

## 🔍 API Endpoint Test Matrisi

| **Endpoint** | **VIEWER** | **PERSONEL** | **ADMIN** | **GENEL_MUDUR** |
|--------------|------------|--------------|-----------|-----------------|
| `/dropdown` | ✅ Kısıtlı | ✅ Kısıtlı | ✅ Tam | ✅ Tam |
| `/dropdown?category=teslimat` | ✅ | ✅ | ✅ | ✅ |
| `/dropdown?category=cariler` | ❌ | ❌ | ✅ | ✅ |
| `/dropdown?category=subeler` | ❌ | ❌ | ✅ | ✅ |