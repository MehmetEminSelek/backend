# 👥 Kullanıcı Rol Yönetimi Rehberi

## 📋 İçindekiler

1. [Rol Hiyerarşisi](#rol-hiyerarşisi)
2. [Yetki Sistemi](#yetki-sistemi)
3. [Kullanıcı Yönetimi](#kullanıcı-yönetimi)
4. [Şube Bazlı Erişim](#şube-bazlı-erişim)
5. [Veri Erişim Seviyeleri](#veri-erişim-seviyeleri)
6. [Güvenlik Politikaları](#güvenlik-politikaları)
7. [Best Practices](#best-practices)

---

## 🏗️ Rol Hiyerarşisi

### 5-Seviyeli Rol Yapısı

```
┌─────────────────────────────────────────────────────────────┐
│                      ADMIN (Level 90)                      │
│  🎯 Tam sistem yönetimi ve güvenlik kontrolü               │
├─────────────────────────────────────────────────────────────┤
│                    MANAGER (Level 70)                      │
│  🎯 Departman yönetimi ve finansal veriler                 │
├─────────────────────────────────────────────────────────────┤
│                  SUPERVISOR (Level 60)                     │
│  🎯 Ekip yönetimi ve operasyonel kontrol                   │
├─────────────────────────────────────────────────────────────┤
│                   OPERATOR (Level 40)                      │
│  🎯 Günlük operasyonel işlemler                            │
├─────────────────────────────────────────────────────────────┤
│                    VIEWER (Level 20)                       │
│  🎯 Sadece görüntüleme yetkisi                             │
└─────────────────────────────────────────────────────────────┘
```

### Rol Detayları

#### 🔴 ADMIN (Seviye 90)
```
👤 Kullanıcı Profili:
   - Sistem yöneticisi
   - IT sorumlusu
   - Güvenlik yöneticisi

🔐 Yetkiler:
   ✅ Tüm sistem erişimi
   ✅ Kullanıcı oluşturma/silme/düzenleme
   ✅ Rol atama ve değiştirme
   ✅ Güvenlik ayarları yönetimi
   ✅ Audit log erişimi
   ✅ Sistem yapılandırması
   ✅ Backup ve restore işlemleri
   ✅ Tüm finansal veriler
   ✅ Hassas müşteri bilgileri
   ✅ Üretim reçeteleri ve maliyetler

📊 Erişebileceği Veriler:
   - Tüm müşteri bilgileri (PII dahil)
   - Tüm finansal veriler
   - Sistem performans metrikleri
   - Güvenlik raporları
   - Audit logları
   - Backup bilgileri
```

#### 🟠 MANAGER (Seviye 70)
```
👤 Kullanıcı Profili:
   - Departman müdürü
   - Bölge müdürü
   - Finansal sorumlu

🔐 Yetkiler:
   ✅ Departman kullanıcı yönetimi
   ✅ Finansal raporlara erişim
   ✅ Maliyet ve kar marjı bilgileri
   ✅ Müşteri bilgileri (PII dahil)
   ✅ Üretim planlaması
   ✅ Fiyat belirleme
   ✅ Tedarikçi bilgileri
   ✅ Satış analizleri
   ❌ Sistem güvenlik ayarları
   ❌ Audit log erişimi

📊 Erişebileceği Veriler:
   - Departman müşteri bilgileri
   - Finansal raporlar ve analizler
   - Maliyet hesaplamaları
   - Kar marjı bilgileri
   - Tedarikçi fiyatları
   - Satış performansı
```

#### 🟡 SUPERVISOR (Seviye 60)
```
👤 Kullanıcı Profili:
   - Vardiya amiri
   - Ekip lideri
   - Operasyon sorumlusu

🔐 Yetkiler:
   ✅ Ekip üyesi görevlendirme
   ✅ Sipariş onaylama/reddetme
   ✅ Üretim durumu güncelleme
   ✅ Kargo takibi
   ✅ Stok yönetimi
   ✅ Temel müşteri bilgileri
   ✅ Günlük raporlar
   ❌ Finansal maliyet bilgileri
   ❌ Kullanıcı oluşturma/silme

📊 Erişebileceği Veriler:
   - Ekip üyesi bilgileri
   - Sipariş durumları
   - Üretim planı
   - Stok seviyeleri
   - Kargo bilgileri
   - Günlük satış rakamları
```

#### 🟢 OPERATOR (Seviye 40)
```
👤 Kullanıcı Profili:
   - Üretim personeli
   - Satış elemanı
   - Kargo personeli

🔐 Yetkiler:
   ✅ Sipariş oluşturma/düzenleme
   ✅ Müşteri kayıt/güncelleme
   ✅ Ürün stok güncelleme
   ✅ Kargo durumu güncelleme
   ✅ Temel raporlama
   ❌ Fiyat değiştirme
   ❌ Kullanıcı yönetimi
   ❌ Finansal veriler

📊 Erişebileceği Veriler:
   - Atanan müşteriler
   - Sipariş bilgileri
   - Ürün listesi (fiyat hariç)
   - Stok durumu
   - Kargo bilgileri
```

#### 🔵 VIEWER (Seviye 20)
```
👤 Kullanıcı Profili:
   - Muhasebe personeli
   - Raporlama uzmanı
   - Dış paydaş

🔐 Yetkiler:
   ✅ Veri görüntüleme
   ✅ Rapor çıktısı alma
   ✅ Temel arama işlemleri
   ❌ Veri düzenleme
   ❌ Sipariş oluşturma
   ❌ Kullanıcı işlemleri

📊 Erişebileceği Veriler:
   - Genel raporlar
   - Sipariş listeleri (detaysız)
   - Ürün katalogları
   - Genel istatistikler
```

---

## 🔐 Yetki Sistemi

### Permission Kategorileri

#### Authentication & Users
```javascript
PERMISSIONS = {
    // Kullanıcı Yönetimi
    VIEW_USERS: 'Kullanıcıları görüntüleme',
    MANAGE_USERS: 'Kullanıcı oluşturma/düzenleme/silme',
    
    // Rol Yönetimi
    VIEW_ROLES: 'Rolleri görüntüleme',
    MANAGE_ROLES: 'Rol atama/değiştirme',
    
    // Güvenlik
    VIEW_AUDIT_LOGS: 'Audit loglarını görüntüleme',
    MANAGE_SECURITY: 'Güvenlik ayarları yönetimi'
}
```

#### Business Operations
```javascript
PERMISSIONS = {
    // Sipariş İşlemleri
    VIEW_ORDERS: 'Siparişleri görüntüleme',
    CREATE_ORDERS: 'Sipariş oluşturma',
    UPDATE_ORDERS: 'Sipariş güncelleme',
    DELETE_ORDERS: 'Sipariş silme',
    APPROVE_ORDERS: 'Sipariş onaylama',
    
    // Müşteri İşlemleri
    VIEW_CUSTOMERS: 'Müşterileri görüntüleme',
    MANAGE_CUSTOMERS: 'Müşteri oluşturma/düzenleme',
    VIEW_CUSTOMER_PII: 'Müşteri kişisel bilgileri',
    
    // Ürün İşlemleri
    VIEW_PRODUCTS: 'Ürünleri görüntüleme',
    MANAGE_PRODUCTS: 'Ürün oluşturma/düzenleme',
    VIEW_PRODUCT_COSTS: 'Ürün maliyet bilgileri'
}
```

#### Financial & Production
```javascript
PERMISSIONS = {
    // Finansal Veriler
    VIEW_FINANCIAL: 'Finansal verileri görüntüleme',
    MANAGE_PRICING: 'Fiyat belirleme/güncelleme',
    VIEW_PROFIT_MARGINS: 'Kar marjları görüntüleme',
    
    // Üretim
    VIEW_PRODUCTION: 'Üretim bilgileri görüntüleme',
    MANAGE_RECIPES: 'Reçete oluşturma/düzenleme',
    VIEW_RECIPE_COSTS: 'Reçete maliyet bilgileri',
    
    // Raporlama
    VIEW_REPORTS: 'Raporları görüntüleme',
    GENERATE_REPORTS: 'Rapor oluşturma',
    EXPORT_DATA: 'Veri dışa aktarma'
}
```

### Permission Mapping

```javascript
// Rol bazlı permission ataması
const ROLE_PERMISSIONS = {
    ADMIN: [
        // Tüm permissions
        'ALL_PERMISSIONS'
    ],
    
    MANAGER: [
        'VIEW_USERS', 'MANAGE_USERS',
        'VIEW_ORDERS', 'CREATE_ORDERS', 'UPDATE_ORDERS', 'APPROVE_ORDERS',
        'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS', 'VIEW_CUSTOMER_PII',
        'VIEW_PRODUCTS', 'MANAGE_PRODUCTS', 'VIEW_PRODUCT_COSTS',
        'VIEW_FINANCIAL', 'MANAGE_PRICING', 'VIEW_PROFIT_MARGINS',
        'VIEW_PRODUCTION', 'MANAGE_RECIPES', 'VIEW_RECIPE_COSTS',
        'VIEW_REPORTS', 'GENERATE_REPORTS', 'EXPORT_DATA'
    ],
    
    SUPERVISOR: [
        'VIEW_ORDERS', 'CREATE_ORDERS', 'UPDATE_ORDERS', 'APPROVE_ORDERS',
        'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS',
        'VIEW_PRODUCTS', 'MANAGE_PRODUCTS',
        'VIEW_PRODUCTION',
        'VIEW_REPORTS'
    ],
    
    OPERATOR: [
        'VIEW_ORDERS', 'CREATE_ORDERS', 'UPDATE_ORDERS',
        'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS',
        'VIEW_PRODUCTS',
        'VIEW_REPORTS'
    ],
    
    VIEWER: [
        'VIEW_ORDERS',
        'VIEW_CUSTOMERS',
        'VIEW_PRODUCTS',
        'VIEW_REPORTS'
    ]
}
```

---

## 👥 Kullanıcı Yönetimi

### Kullanıcı Oluşturma

#### Adım 1: Yetki Kontrolü
```
✅ Sadece ADMIN ve MANAGER rolleri kullanıcı oluşturabilir
✅ MANAGER sadece kendi seviyesi ve altındaki rolleri atayabilir
✅ Branch manager sadece kendi şubesine kullanıcı ekleyebilir
```

#### Adım 2: Bilgi Girişi
```
📝 Gerekli Bilgiler:
   - Ad Soyad (zorunlu)
   - Email (zorunlu, benzersiz)
   - Telefon (zorunlu, benzersiz)
   - Rol (zorunlu)
   - Şube (zorunlu)
   - Başlangıç Tarihi
   - Günlük Ücret (opsiyonel)
   - SGK Durumu
```

#### Adım 3: Güvenlik Ayarları
```
🔐 Otomatik Güvenlik:
   - Geçici şifre oluşturulur
   - İlk giriş şifre değiştirme zorunluluğu
   - Hesap varsayılan olarak aktif
   - Email doğrulama gönderilir
```

### Kullanıcı Düzenleme

#### Bilgi Güncelleme
```
✏️ Güncellenebilir Alanlar:
   - Kişisel bilgiler (ad, telefon)
   - Rol (yetki dahilinde)
   - Şube (yetki dahilinde)
   - Aktiflik durumu
   - Günlük ücret (MANAGER+)
```

#### Rol Değiştirme Kuralları
```
📊 Rol Değiştirme Matrisi:
   ADMIN → Herhangi bir role değiştirebilir
   MANAGER → SUPERVISOR, OPERATOR, VIEWER'a değiştirebilir
   SUPERVISOR → Rol değiştiremez
   OPERATOR → Rol değiştiremez
   VIEWER → Rol değiştiremez
```

### Kullanıcı Silme

#### Soft Delete Sistemi
```
🗑️ Güvenli Silme:
   - Kullanıcı fiziksel olarak silinmez
   - aktif: false olarak işaretlenir
   - Audit trail korunur
   - İlişkili veriler etkilenmez
   - Sadece ADMIN tam silme yapabilir
```

#### Silme Öncesi Kontroller
```
⚠️ Kontrol Edilenler:
   - Aktif siparişler var mı?
   - Ödenmemiş alacaklar var mı?
   - Devam eden işlemler var mı?
   - Son 30 gün aktivite var mı?
```

---

## 🏢 Şube Bazlı Erişim

### Şube Hiyerarşisi
```
🏪 Şube Yapısı:
   ├─ Merkez Şube (Genel Müdürlük)
   ├─ İstanbul Şube
   ├─ Ankara Şube
   ├─ İzmir Şube
   └─ Online Satış
```

### Erişim Kontrol Matrisi

#### ADMIN Seviyesi
```
🌐 Global Erişim:
   ✅ Tüm şubeleri görür ve yönetir
   ✅ Şubeler arası veri transferi
   ✅ Şube performans karşılaştırması
   ✅ Merkezi raporlama
```

#### MANAGER Seviyesi
```
🏢 Şube/Bölge Bazlı:
   ✅ Atandığı şube(ler)i tam kontrol
   ✅ Alt şubeleri görüntüleme (varsa)
   ✅ Şube bazlı raporlama
   ❌ Diğer şubelerin detay bilgileri
```

#### SUPERVISOR & OPERATOR Seviyesi
```
🏪 Tek Şube Erişimi:
   ✅ Sadece atandığı şubeyi görür
   ✅ Şube içi tüm operasyonlar
   ❌ Şubeler arası karşılaştırma
   ❌ Diğer şube bilgileri
```

### Şube Bazlı Veri Filtreleme

```javascript
// Otomatik şube filtreleme
const getShubeBazliVeri = (user, veri) => {
    if (user.roleLevel >= 80) {
        // ADMIN: Tüm şubeler
        return veri;
    } else if (user.roleLevel >= 70) {
        // MANAGER: Kendi şubesi + alt şubeler
        return veri.filter(item => 
            user.yetkiliSubeler.includes(item.subeId)
        );
    } else {
        // SUPERVISOR/OPERATOR: Sadece kendi şubesi
        return veri.filter(item => 
            item.subeId === user.subeId
        );
    }
};
```

---

## 📊 Veri Erişim Seviyeleri

### Müşteri Bilgileri

#### Seviye 1: Temel Bilgiler (OPERATOR+)
```javascript
{
    id: "12345",
    musteriKodu: "MUS001",
    musteriTipi: "BIREYSEL",
    aktif: true
}
```

#### Seviye 2: İletişim Bilgileri (SUPERVISOR+)
```javascript
{
    ...temelBilgiler,
    telefon: "05XX XXX XX 45",  // Kısmi maskeleme
    email: "m***@email.com",     // Kısmi maskeleme
    bolge: "İstanbul"
}
```

#### Seviye 3: Tam Kişisel Bilgiler (MANAGER+)
```javascript
{
    ...iletisimBilgileri,
    ad: "Mehmet",
    soyad: "Yılmaz",
    telefon: "0532 123 45 67",   // Tam bilgi
    email: "mehmet@email.com",   // Tam bilgi
    dogumTarihi: "1985-05-15"
}
```

#### Seviye 4: Hassas Bilgiler (ADMIN)
```javascript
{
    ...tamBilgiler,
    tcKimlikNo: "12345678901",
    vergiNo: "1234567890",
    krediLimiti: 50000,
    riskSkoru: 85
}
```

### Finansal Veriler

#### Seviye 1: Satış Fiyatları (OPERATOR+)
```javascript
{
    satisFiyati: 25.50,
    kdvDahilFiyat: 30.09,
    indirimOrani: 10
}
```

#### Seviye 2: Maliyet Bilgileri (SUPERVISOR+)
```javascript
{
    ...satisBilgileri,
    tahminiMaliyet: 18.00,  // Yaklaşık maliyet
    karMarji: "% 30-40"     // Aralık bilgisi
}
```

#### Seviye 3: Detay Maliyetler (MANAGER+)
```javascript
{
    ...maliyetBilgileri,
    gercekMaliyet: 18.75,
    karMarji: 36.2,
    hammaddeMaliyet: 12.50,
    iscilikMaliyet: 4.25,
    genelGiderPayi: 2.00
}
```

#### Seviye 4: Tedarikçi Bilgileri (ADMIN)
```javascript
{
    ...detayMaliyetler,
    tedarikciMaliyet: 15.25,
    tedarikciKodu: "TED001",
    alisFiyati: 16.80,
    tedarikciMarji: 9.2
}
```

### Üretim Bilgileri

#### Seviye 1: Ürün Listesi (OPERATOR+)
```javascript
{
    urunAdi: "Antep Baklavası",
    kategori: "Baklava",
    birim: "Tepsi",
    mevcutStok: 25
}
```

#### Seviye 2: Üretim Durumu (SUPERVISOR+)
```javascript
{
    ...urunBilgileri,
    uretimSuresi: "2 saat",
    gerekliPersonel: 3,
    uretimKapasitesi: 50
}
```

#### Seviye 3: Reçete Bilgileri (MANAGER+)
```javascript
{
    ...uretimBilgileri,
    recete: {
        malzemeler: ["Un", "Yağ", "Fıstık"],
        miktarlar: ["1 kg", "500g", "200g"],
        islemler: ["Yoğurma", "Açma", "Pişirme"]
    }
}
```

#### Seviye 4: Tam Reçete ve Maliyetler (ADMIN)
```javascript
{
    ...receteBilgileri,
    detayliRecete: {
        hammaddeler: [
            {adi: "Un", miktar: 1000, birim: "gr", maliyet: 2.50},
            {adi: "Tereyağı", miktar: 500, birim: "gr", maliyet: 15.00},
            {adi: "Antep Fıstığı", miktar: 200, birim: "gr", maliyet: 25.00}
        ],
        toplamMaliyet: 42.50,
        birimMaliyet: 21.25
    }
}
```

---

## 🔒 Güvenlik Politikaları

### Şifre Politikaları

#### Şifre Gereksinimleri
```
📝 Şifre Kuralları:
   ✅ Minimum 8 karakter
   ✅ En az 1 büyük harf
   ✅ En az 1 küçük harf  
   ✅ En az 1 rakam
   ✅ En az 1 özel karakter (!@#$%^&*)
   ✅ Son 5 şifre kullanılamaz
   ✅ Kullanıcı adını içeremez
```

#### Şifre Süresi
```
⏰ Süre Politikaları:
   🔴 ADMIN: 60 gün
   🟠 MANAGER: 90 gün
   🟡 SUPERVISOR: 90 gün
   🟢 OPERATOR: 120 gün
   🔵 VIEWER: 120 gün
```

### Oturum Güvenliği

#### Oturum Süreleri
```
⏱️ Oturum Limitleri:
   🔴 ADMIN: 8 saat (hassas işlemler için 4 saat)
   🟠 MANAGER: 8 saat
   🟡 SUPERVISOR: 10 saat
   🟢 OPERATOR: 12 saat
   🔵 VIEWER: 12 saat
```

#### İnaktivite Kontrolü
```
😴 İnaktivite Süresi:
   - 30 dakika inaktivite sonrası uyarı
   - 45 dakika sonrası otomatik çıkış
   - Hassas işlemlerde 15 dakika
```

### Giriş Güvenliği

#### Başarısız Giriş Kontrolü
```
🚫 Giriş Denemesi Limitleri:
   - 5 başarısız deneme → 30 dakika kilitlenme
   - 10 başarısız deneme → 1 saat kilitlenme
   - 15 başarısız deneme → Manuel açma gerekir
```

#### IP Bazlı Kontrol
```
🌐 IP Güvenliği:
   ✅ Ofis IP'lerinden sınırsız erişim
   ⚠️ Dış IP'lerden ek doğrulama
   🚫 Kara listeli IP'lerden erişim yok
```

---

## ✅ Best Practices

### Kullanıcı Oluşturma En İyi Uygulamaları

#### 1. Principle of Least Privilege
```
📊 Minimum Yetki Prensibi:
   ✅ Kullanıcıya sadece görevini yapabileceği minimum yetki verin
   ✅ İhtiyaç duyduğunda yetkileri artırın
   ✅ Proje bitiminde geçici yetkileri kaldırın
   ❌ "Her ihtimale karşı" fazla yetki vermeyin
```

#### 2. Role-Based Assignment
```
👤 Rol Bazlı Atama:
   ✅ Pozisyona uygun rol seçin
   ✅ Şube sorumluluğunu dikkate alın
   ✅ Geçici görevler için geçici roller oluşturun
   ❌ "Kolaylık için" ADMIN rolü vermeyin
```

#### 3. Regular Review
```
🔄 Düzenli Gözden Geçirme:
   ✅ Ayda bir kullanıcı listesini gözden geçirin
   ✅ Pasif kullanıcıları deaktive edin
   ✅ Rol değişikliklerini onaylayın
   ✅ Ayrılan personelin erişimlerini kaldırın
```

### Güvenlik İzleme

#### 1. Activity Monitoring
```
👁️ Aktivite İzleme:
   ✅ Şüpheli giriş zamanlarını kontrol edin
   ✅ Olağandışı veri erişimlerini izleyin
   ✅ Çoklu cihaz girişlerini kontrol edin
   ✅ Başarısız giriş denemelerini takip edin
```

#### 2. Permission Auditing
```
🔍 Yetki Denetimi:
   ✅ Üç ayda bir yetki atamasını gözden geçirin
   ✅ Kullanılmayan yetkileri kaldırın
   ✅ Kritik işlemler için onay mekanizması ekleyin
   ✅ Yetki değişikliklerini loglayın
```

### Veri Koruma

#### 1. Data Classification
```
📂 Veri Sınıflandırması:
   🔴 Kritik: Finansal veriler, reçeteler
   🟠 Hassas: Müşteri PII, maaş bilgileri
   🟡 İç: Operasyonel veriler, raporlar
   🟢 Genel: Ürün katalogları, haberler
```

#### 2. Access Logging
```
📋 Erişim Loglama:
   ✅ Her hassas veri erişimini loglayın
   ✅ GDPR uyumluluk için izin belgeleyin
   ✅ Audit trail'leri düzenli backup alın
   ✅ Log verilerini güvenli saklayın
```

### Incident Response

#### 1. Security Incident Handling
```
🚨 Güvenlik Olayı Müdahalesi:
   1️⃣ Olayı tespit edin ve kategorize edin
   2️⃣ Etkilenen kullanıcıları deaktive edin
   3️⃣ Sistem loglarını analiz edin
   4️⃣ Gerekirse tüm şifreleri sıfırlayın
   5️⃣ Olayı dokümante edin ve rapor hazırlayın
```

#### 2. Recovery Procedures
```
🔧 Kurtarma Prosedürleri:
   ✅ Düzenli backup kontrolü yapın
   ✅ Kurtarma senaryolarını test edin
   ✅ Acil durum iletişim planı hazırlayın
   ✅ Business continuity planı oluşturun
```

---

## 📞 Destek ve Yardım

### Kullanıcı Yönetimi Sorunları
```
❓ Sık Sorulan Sorular:
   Q: Kullanıcı şifresini nasıl sıfırlarım?
   A: Kullanıcı Yönetimi → Kullanıcı Seç → Şifre Sıfırla

   Q: Rol değiştirme yapamıyorum?
   A: Yetki seviyenizi kontrol edin, sadece alt rolleri değiştirebilirsiniz

   Q: Şube değiştirme nasıl yapılır?
   A: ADMIN veya branch MANAGER yetkisi gerekir
```

### Teknik Destek
```
📞 İletişim:
   - Teknik Destek: support@ogsiparis.com
   - Acil Durum: +90 XXX XXX XX XX
   - Dokümantasyon: docs.ogsiparis.com
```

### Eğitim Kaynakları
```
📚 Öğrenme Materyalleri:
   - Video eğitimler: training.ogsiparis.com
   - Kullanıcı kılavuzları: docs.ogsiparis.com/guides
   - Webinar programı: Ayda bir canlı eğitim
```

---

*Bu doküman kullanıcı rol yönetimi için kapsamlı rehberdir. Güvenlik ve verimlilik için düzenli olarak güncellenmelidir.* 